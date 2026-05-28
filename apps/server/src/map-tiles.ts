import {
	getHabitatMvtTile,
	type HabitatMvtTileFilters,
	type HabitatMvtTileInput,
	type Kysely,
	type SimmerDatabase,
} from '@simmer-mosquito/db';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';

const mvtContentType = 'application/vnd.mapbox-vector-tile';
const maxSupportedZoom = 22;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TileDb = Kysely<SimmerDatabase>;
type HabitatTileReader = (db: TileDb, input: HabitatMvtTileInput) => Promise<Uint8Array>;

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
	},
): void {
	const tileSets = createTileSetRegistry({
		getHabitatTile: options.getHabitatTile ?? getHabitatMvtTile,
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

	return {
		ok: true,
		filters: {
			...(isActive.value === undefined ? {} : { isActive: isActive.value }),
			...(isInaccessible.value === undefined ? {} : { isInaccessible: isInaccessible.value }),
			...(habitatTypeIds.value === undefined ? {} : { habitatTypeIds: habitatTypeIds.value }),
		},
	};
}

const habitatFilterParams = new Set(['isActive', 'isInaccessible', 'habitatTypeId']);

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
