import {
	countActiveHabitatsByType,
	getHabitatDisplayRowById,
	getHabitatMvtTile,
	type HabitatByIdInput,
	type HabitatMvtTileFilters,
	type HabitatMvtTileInput,
	type HabitatTypeUsageRow,
	type Kysely,
	listHabitatDisplayRowsByBounds,
	type SafeHabitatDisplayRow,
	type SimmerDatabase,
} from '@simmer-mosquito/db';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';

const mvtContentType = 'application/vnd.mapbox-vector-tile';
const maxSupportedZoom = 22;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TileDb = Kysely<SimmerDatabase>;
type HabitatTileReader = (db: TileDb, input: HabitatMvtTileInput) => Promise<Uint8Array>;
type HabitatDisplayReader = (
	db: TileDb,
	input: HabitatDisplayInput,
) => Promise<SafeHabitatDisplayRow[]>;
type HabitatDisplayByIdReader = (
	db: TileDb,
	input: HabitatByIdInput,
) => Promise<SafeHabitatDisplayRow | undefined>;
type HabitatTypeUsageReader = (
	db: TileDb,
	input: { readonly organizationId: string },
) => Promise<HabitatTypeUsageRow[]>;

type TileCoordinateResult =
	| {
			readonly ok: true;
			readonly coordinate: TileCoordinate;
	  }
	| {
			readonly ok: false;
			readonly reason: string;
	  };

interface TileCoordinate {
	readonly z: number;
	readonly x: number;
	readonly y: number;
}

type HabitatFilterResult =
	| {
			readonly ok: true;
			readonly filters: HabitatMvtTileFilters;
	  }
	| {
			readonly ok: false;
			readonly reason: string;
	  };

type HabitatDisplayQueryResult =
	| {
			readonly ok: true;
			readonly input: HabitatDisplayInput;
	  }
	| {
			readonly ok: false;
			readonly reason: string;
	  };

interface HabitatDisplayInput {
	readonly organizationId: string;
	readonly bounds: {
		readonly west: number;
		readonly south: number;
		readonly east: number;
		readonly north: number;
	};
	readonly filters?: HabitatMvtTileFilters;
	readonly limit: number;
}

interface TileSetDefinition {
	readonly parseFilters: (searchParams: URLSearchParams) => HabitatFilterResult;
	readonly getTile: (
		db: TileDb,
		input: {
			readonly coordinate: TileCoordinate;
			readonly organizationId: string;
			readonly filters: HabitatMvtTileFilters;
		},
	) => Promise<Uint8Array>;
}

export function registerMapTileRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: TileDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
		readonly getHabitatTile?: HabitatTileReader;
		readonly listHabitatDisplayRows?: HabitatDisplayReader;
		readonly getHabitatDisplayRow?: HabitatDisplayByIdReader;
		readonly countHabitatTypeUsage?: HabitatTypeUsageReader;
	},
): void {
	const tileSets = createTileSetRegistry({
		getHabitatTile: options.getHabitatTile ?? getHabitatMvtTile,
	});
	const listDisplayRows = options.listHabitatDisplayRows ?? listHabitatDisplayRowsByBounds;
	const getDisplayRow = options.getHabitatDisplayRow ?? getHabitatDisplayRowById;
	const countTypeUsage = options.countHabitatTypeUsage ?? countActiveHabitatsByType;

	app.get('/map/habitats', options.authContextMiddleware, async (context) => {
		const authContext = context.get('authContext');
		const queryResult = parseHabitatDisplayQuery(
			new URL(context.req.url).searchParams,
			authContext.organization.id,
		);

		if (!queryResult.ok) {
			return context.json({ error: 'invalid_query', reason: queryResult.reason }, 400);
		}

		const habitats = await listDisplayRows(options.db, queryResult.input);

		return context.json({ habitats });
	});

	// Registered before `/:id` so the literal segment wins over the UUID param.
	app.get('/map/habitats/type-usage', options.authContextMiddleware, async (context) => {
		const authContext = context.get('authContext');
		const usage = await countTypeUsage(options.db, {
			organizationId: authContext.organization.id,
		});

		return context.json({ usage });
	});

	app.get('/map/habitats/:id', options.authContextMiddleware, async (context) => {
		const id = context.req.param('id');
		if (!uuidPattern.test(id)) {
			return context.json({ error: 'invalid_id', reason: 'Habitat id must be a UUID.' }, 400);
		}

		const authContext = context.get('authContext');
		const habitat = await getDisplayRow(options.db, {
			id,
			organizationId: authContext.organization.id,
		});

		if (habitat === undefined) {
			return context.json({ error: 'not_found', reason: 'Habitat not found.' }, 404);
		}

		return context.json({ habitat });
	});

	app.get(
		'/map/tiles/:tileset/:z/:x/:yWithExtension',
		options.authContextMiddleware,
		async (context) => {
			const tileset = context.req.param('tileset');
			const tileSet = tileSets.get(tileset);
			if (tileSet === undefined) {
				return context.json({ error: 'invalid_tileset', reason: 'Unknown map tileset.' }, 400);
			}

			const coordinateResult = parseTileCoordinate({
				z: context.req.param('z'),
				x: context.req.param('x'),
				yWithExtension: context.req.param('yWithExtension'),
			});
			if (!coordinateResult.ok) {
				return context.json(
					{ error: 'invalid_tile_coordinate', reason: coordinateResult.reason },
					400,
				);
			}

			const filterResult = tileSet.parseFilters(new URL(context.req.url).searchParams);
			if (!filterResult.ok) {
				return context.json({ error: 'invalid_filter', reason: filterResult.reason }, 400);
			}

			const authContext = context.get('authContext');
			const tile = await tileSet.getTile(options.db, {
				coordinate: coordinateResult.coordinate,
				organizationId: authContext.organization.id,
				filters: filterResult.filters,
			});

			return new Response(tile, {
				status: 200,
				headers: {
					'content-type': mvtContentType,
				},
			});
		},
	);
}

function createTileSetRegistry(options: {
	readonly getHabitatTile: HabitatTileReader;
}): ReadonlyMap<string, TileSetDefinition> {
	return new Map([
		[
			'habitats',
			{
				parseFilters: parseHabitatTileFilters,
				getTile: (db, input) =>
					options.getHabitatTile(db, {
						...input.coordinate,
						organizationId: input.organizationId,
						filters: input.filters,
					}),
			},
		],
	]);
}

export function parseTileCoordinate(input: {
	readonly z: string;
	readonly x: string;
	readonly yWithExtension: string;
}): TileCoordinateResult {
	if (!input.yWithExtension.endsWith('.mvt')) {
		return { ok: false, reason: 'Tile path must end in .mvt.' };
	}

	const y = input.yWithExtension.slice(0, -'.mvt'.length);
	const z = parseInteger(input.z);
	const x = parseInteger(input.x);
	const parsedY = parseInteger(y);

	if (z === null || x === null || parsedY === null) {
		return { ok: false, reason: 'Tile coordinates must be integers.' };
	}

	if (z < 0 || z > maxSupportedZoom) {
		return { ok: false, reason: `z must be between 0 and ${maxSupportedZoom}.` };
	}

	const tileCount = 2 ** z;
	if (x < 0 || x >= tileCount || parsedY < 0 || parsedY >= tileCount) {
		return { ok: false, reason: 'x and y must be within the z tile range.' };
	}

	return {
		ok: true,
		coordinate: {
			z,
			x,
			y: parsedY,
		},
	};
}

export function parseHabitatTileFilters(searchParams: URLSearchParams): HabitatFilterResult {
	const unknownParams = [...searchParams.keys()].filter((param) => !habitatFilterParams.has(param));
	if (unknownParams.length > 0) {
		return {
			ok: false,
			reason: `Unsupported habitat tile filter: ${unknownParams[0]}.`,
		};
	}

	const isActive = parseOptionalBooleanFilter(searchParams, 'isActive');
	if (!isActive.ok) {
		return isActive;
	}

	const isInaccessible = parseOptionalBooleanFilter(searchParams, 'isInaccessible');
	if (!isInaccessible.ok) {
		return isInaccessible;
	}

	const habitatTypeIds = parseOptionalUuidListFilter(searchParams, 'habitatTypeId');
	if (!habitatTypeIds.ok) {
		return habitatTypeIds;
	}

	const tagIds = parseOptionalUuidListFilter(searchParams, 'tagId');
	if (!tagIds.ok) {
		return tagIds;
	}

	const search = parseOptionalTextFilter(searchParams, 'search');
	if (!search.ok) {
		return search;
	}

	return {
		ok: true,
		filters: {
			...(isActive.value === undefined ? {} : { isActive: isActive.value }),
			...(isInaccessible.value === undefined ? {} : { isInaccessible: isInaccessible.value }),
			...(habitatTypeIds.value === undefined ? {} : { habitatTypeIds: habitatTypeIds.value }),
			...(tagIds.value === undefined ? {} : { tagIds: tagIds.value }),
			...(search.value === undefined ? {} : { search: search.value }),
		},
	};
}

export function parseHabitatDisplayQuery(
	searchParams: URLSearchParams,
	organizationId: string,
): HabitatDisplayQueryResult {
	const bbox = parseBoundingBoxParam(searchParams.get('bbox'));
	if (!bbox.ok) {
		return bbox;
	}

	const limit = parseLimitParam(searchParams.get('limit'));
	if (!limit.ok) {
		return limit;
	}

	const filterParams = new URLSearchParams(searchParams);
	filterParams.delete('bbox');
	filterParams.delete('limit');

	const filterResult = parseHabitatTileFilters(filterParams);
	if (!filterResult.ok) {
		return filterResult;
	}

	return {
		ok: true,
		input: {
			organizationId,
			bounds: bbox.bounds,
			filters: filterResult.filters,
			limit: limit.value,
		},
	};
}

const habitatFilterParams = new Set([
	'isActive',
	'isInaccessible',
	'habitatTypeId',
	'tagId',
	'search',
]);
const maxDisplayLimit = 50;
const maxSearchLength = 200;

function parseInteger(value: string): number | null {
	if (!/^\d+$/.test(value)) {
		return null;
	}

	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseOptionalBooleanFilter(
	searchParams: URLSearchParams,
	param: string,
):
	| { readonly ok: true; readonly value: boolean | undefined }
	| { readonly ok: false; readonly reason: string } {
	const values = searchParams.getAll(param);
	if (values.length === 0) {
		return { ok: true, value: undefined };
	}
	if (values.length > 1) {
		return { ok: false, reason: `${param} may only be provided once.` };
	}

	const normalized = values[0]?.trim().toLowerCase();
	if (normalized === 'true') {
		return { ok: true, value: true };
	}
	if (normalized === 'false') {
		return { ok: true, value: false };
	}

	return { ok: false, reason: `${param} must be true or false.` };
}

function parseOptionalUuidListFilter(
	searchParams: URLSearchParams,
	param: string,
):
	| { readonly ok: true; readonly value: readonly string[] | undefined }
	| { readonly ok: false; readonly reason: string } {
	const values = searchParams
		.getAll(param)
		.flatMap((value) => value.split(','))
		.map((value) => value.trim())
		.filter((value) => value.length > 0);

	if (values.length === 0) {
		return searchParams.has(param)
			? { ok: false, reason: `${param} must include at least one UUID.` }
			: { ok: true, value: undefined };
	}

	for (const value of values) {
		if (!uuidPattern.test(value)) {
			return { ok: false, reason: `${param} must contain only UUID values.` };
		}
	}

	return { ok: true, value: [...new Set(values)] };
}

function parseOptionalTextFilter(
	searchParams: URLSearchParams,
	param: string,
):
	| { readonly ok: true; readonly value: string | undefined }
	| { readonly ok: false; readonly reason: string } {
	const values = searchParams.getAll(param);
	if (values.length === 0) {
		return { ok: true, value: undefined };
	}
	if (values.length > 1) {
		return { ok: false, reason: `${param} may only be provided once.` };
	}

	const trimmed = values[0]?.trim() ?? '';
	if (trimmed.length === 0) {
		return { ok: true, value: undefined };
	}
	if (trimmed.length > maxSearchLength) {
		return { ok: false, reason: `${param} must be ${maxSearchLength} characters or fewer.` };
	}

	return { ok: true, value: trimmed };
}

function parseBoundingBoxParam(value: string | null):
	| {
			readonly ok: true;
			readonly bounds: HabitatDisplayInput['bounds'];
	  }
	| {
			readonly ok: false;
			readonly reason: string;
	  } {
	if (value === null) {
		return { ok: false, reason: 'bbox is required.' };
	}

	const parts = value.split(',').map((part) => Number.parseFloat(part.trim()));
	const [west, south, east, north] = parts;

	if (
		parts.length !== 4 ||
		west === undefined ||
		south === undefined ||
		east === undefined ||
		north === undefined ||
		!isValidLng(west) ||
		!isValidLng(east) ||
		!isValidLat(south) ||
		!isValidLat(north) ||
		west > east ||
		south > north
	) {
		return { ok: false, reason: 'bbox must be west,south,east,north.' };
	}

	return {
		ok: true,
		bounds: { west, south, east, north },
	};
}

function parseLimitParam(
	value: string | null,
): { readonly ok: true; readonly value: number } | { readonly ok: false; readonly reason: string } {
	if (value === null || value.trim() === '') {
		return { ok: true, value: maxDisplayLimit };
	}

	const parsed = parseInteger(value);
	if (parsed === null || parsed < 1 || parsed > maxDisplayLimit) {
		return { ok: false, reason: `limit must be between 1 and ${maxDisplayLimit}.` };
	}

	return { ok: true, value: parsed };
}

function isValidLng(value: number): boolean {
	return Number.isFinite(value) && value >= -180 && value <= 180;
}

function isValidLat(value: number): boolean {
	return Number.isFinite(value) && value >= -90 && value <= 90;
}
