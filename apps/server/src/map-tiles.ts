import {
	countActiveHabitatsByType,
	getHabitatDisplayRowById,
	getHabitatMvtTile,
	getInspectionDisplayRowById,
	getInspectionMvtTile,
	type HabitatByIdInput,
	type HabitatMvtTileFilters,
	type HabitatMvtTileInput,
	type HabitatSearchInput,
	type HabitatSiteDisplayRow,
	type HabitatsByIdsInput,
	type HabitatTypeUsageRow,
	type InspectionByIdInput,
	type InspectionDensity,
	type InspectionMvtTileFilters,
	type InspectionMvtTileInput,
	inspectionDensityValues,
	type Kysely,
	listHabitatDisplayRowsByBounds,
	listHabitatDisplayRowsByIds,
	listInspectionDisplayRowsByBounds,
	type SafeHabitatDisplayRow,
	type SafeInspectionDisplayRow,
	type SimmerDatabase,
	searchHabitatSites,
} from '@simmer-mosquito/db';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';

// Route site + search readers registered below the literal habitat map routes.
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
type HabitatDisplayByIdsReader = (
	db: TileDb,
	input: HabitatsByIdsInput,
) => Promise<HabitatSiteDisplayRow[]>;
type HabitatSearchReader = (
	db: TileDb,
	input: HabitatSearchInput,
) => Promise<HabitatSiteDisplayRow[]>;
type HabitatTypeUsageReader = (
	db: TileDb,
	input: { readonly organizationId: string },
) => Promise<HabitatTypeUsageRow[]>;
type InspectionTileReader = (db: TileDb, input: InspectionMvtTileInput) => Promise<Uint8Array>;
type InspectionDisplayReader = (
	db: TileDb,
	input: InspectionDisplayInput,
) => Promise<SafeInspectionDisplayRow[]>;
type InspectionDisplayByIdReader = (
	db: TileDb,
	input: InspectionByIdInput,
) => Promise<SafeInspectionDisplayRow | undefined>;

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
	readonly bounds: MapBounds;
	readonly filters?: HabitatMvtTileFilters;
	readonly limit: number;
}

interface MapBounds {
	readonly west: number;
	readonly south: number;
	readonly east: number;
	readonly north: number;
}

type InspectionFilterResult =
	| { readonly ok: true; readonly filters: InspectionMvtTileFilters }
	| { readonly ok: false; readonly reason: string };

type InspectionDisplayQueryResult =
	| { readonly ok: true; readonly input: InspectionDisplayInput }
	| { readonly ok: false; readonly reason: string };

interface InspectionDisplayInput {
	readonly organizationId: string;
	readonly bounds: MapBounds;
	readonly filters?: InspectionMvtTileFilters;
	readonly limit: number;
}

// The tileset registry is type-erased at the Map boundary so it can hold tilesets
// with different filter shapes (habitats, inspections). `defineTileSet` keeps each
// entry's parse/getTile pair internally type-safe; only the erasure to `unknown`
// filters crosses the boundary, and the pair is defined together so they can't drift.
interface TileSetDefinition {
	readonly parseFilters: (
		searchParams: URLSearchParams,
	) =>
		| { readonly ok: true; readonly filters: unknown }
		| { readonly ok: false; readonly reason: string };
	readonly getTile: (
		db: TileDb,
		input: {
			readonly coordinate: TileCoordinate;
			readonly organizationId: string;
			readonly filters: unknown;
		},
	) => Promise<Uint8Array>;
}

function defineTileSet<F>(def: {
	readonly parseFilters: (
		searchParams: URLSearchParams,
	) => { readonly ok: true; readonly filters: F } | { readonly ok: false; readonly reason: string };
	readonly getTile: (
		db: TileDb,
		input: {
			readonly coordinate: TileCoordinate;
			readonly organizationId: string;
			readonly filters: F;
		},
	) => Promise<Uint8Array>;
}): TileSetDefinition {
	return def as unknown as TileSetDefinition;
}

export function registerMapTileRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: TileDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
		readonly getHabitatTile?: HabitatTileReader;
		readonly listHabitatDisplayRows?: HabitatDisplayReader;
		readonly getHabitatDisplayRow?: HabitatDisplayByIdReader;
		readonly listHabitatDisplayRowsByIds?: HabitatDisplayByIdsReader;
		readonly searchHabitatDisplayRows?: HabitatSearchReader;
		readonly countHabitatTypeUsage?: HabitatTypeUsageReader;
		readonly getInspectionTile?: InspectionTileReader;
		readonly listInspectionDisplayRows?: InspectionDisplayReader;
		readonly getInspectionDisplayRow?: InspectionDisplayByIdReader;
	},
): void {
	const tileSets = createTileSetRegistry({
		getHabitatTile: options.getHabitatTile ?? getHabitatMvtTile,
		getInspectionTile: options.getInspectionTile ?? getInspectionMvtTile,
	});
	const listDisplayRows = options.listHabitatDisplayRows ?? listHabitatDisplayRowsByBounds;
	const getDisplayRow = options.getHabitatDisplayRow ?? getHabitatDisplayRowById;
	const listDisplayRowsByIds = options.listHabitatDisplayRowsByIds ?? listHabitatDisplayRowsByIds;
	const searchDisplayRows = options.searchHabitatDisplayRows ?? searchHabitatSites;
	const countTypeUsage = options.countHabitatTypeUsage ?? countActiveHabitatsByType;
	const listInspectionRows = options.listInspectionDisplayRows ?? listInspectionDisplayRowsByBounds;
	const getInspectionRow = options.getInspectionDisplayRow ?? getInspectionDisplayRowById;

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

	// Resolve an explicit habitat id set (e.g. a route's stops) in one round-trip.
	// Registered before `/:id` so the literal segment wins over the UUID param.
	app.get('/map/habitats/by-ids', options.authContextMiddleware, async (context) => {
		const idsResult = parseHabitatIdsParam(new URL(context.req.url).searchParams);
		if (!idsResult.ok) {
			return context.json({ error: 'invalid_query', reason: idsResult.reason }, 400);
		}

		if (idsResult.ids.length === 0) {
			return context.json({ habitats: [] });
		}

		const authContext = context.get('authContext');
		const habitats = await listDisplayRowsByIds(options.db, {
			organizationId: authContext.organization.id,
			ids: idsResult.ids,
		});

		return context.json({ habitats });
	});

	// POST sibling of `by-ids` for callers resolving a large id set (e.g. every
	// habitat behind a window of inspections). The same lookup as the GET route,
	// but the ids ride in the body so the request never runs into URL/header
	// length limits that reject a long `?ids=` query string.
	app.post('/map/habitats/by-ids', options.authContextMiddleware, async (context) => {
		const body = (await context.req.json().catch(() => null)) as { readonly ids?: unknown } | null;
		const rawIds = body?.ids;
		if (!Array.isArray(rawIds) || rawIds.some((id) => typeof id !== 'string')) {
			return context.json(
				{ error: 'invalid_body', reason: 'ids must be an array of strings.' },
				400,
			);
		}

		// Reuse the query-param validator (uuid shape + count cap) so both routes
		// enforce identical rules from a single source of truth.
		const params = new URLSearchParams();
		params.set('ids', (rawIds as string[]).join(','));
		const idsResult = parseHabitatIdsParam(params);
		if (!idsResult.ok) {
			return context.json({ error: 'invalid_body', reason: idsResult.reason }, 400);
		}

		if (idsResult.ids.length === 0) {
			return context.json({ habitats: [] });
		}

		const authContext = context.get('authContext');
		const habitats = await listDisplayRowsByIds(options.db, {
			organizationId: authContext.organization.id,
			ids: idsResult.ids,
		});

		return context.json({ habitats });
	});

	// Name/address search for pickers (e.g. adding a stop to a route). Non-spatial.
	// Registered before `/:id` so the literal segment wins over the UUID param.
	app.get('/map/habitats/search', options.authContextMiddleware, async (context) => {
		const searchResult = parseHabitatSearchQuery(new URL(context.req.url).searchParams);
		if (!searchResult.ok) {
			return context.json({ error: 'invalid_query', reason: searchResult.reason }, 400);
		}

		if (searchResult.search.length === 0) {
			return context.json({ habitats: [] });
		}

		const authContext = context.get('authContext');
		const habitats = await searchDisplayRows(options.db, {
			organizationId: authContext.organization.id,
			search: searchResult.search,
			limit: searchResult.limit,
		});

		return context.json({ habitats });
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

	app.get('/map/inspections', options.authContextMiddleware, async (context) => {
		const authContext = context.get('authContext');
		const queryResult = parseInspectionDisplayQuery(
			new URL(context.req.url).searchParams,
			authContext.organization.id,
		);

		if (!queryResult.ok) {
			return context.json({ error: 'invalid_query', reason: queryResult.reason }, 400);
		}

		const inspections = await listInspectionRows(options.db, queryResult.input);

		return context.json({ inspections });
	});

	app.get('/map/inspections/:id', options.authContextMiddleware, async (context) => {
		const id = context.req.param('id');
		if (!uuidPattern.test(id)) {
			return context.json({ error: 'invalid_id', reason: 'Inspection id must be a UUID.' }, 400);
		}

		const authContext = context.get('authContext');
		const inspection = await getInspectionRow(options.db, {
			id,
			organizationId: authContext.organization.id,
		});

		if (inspection === undefined) {
			return context.json({ error: 'not_found', reason: 'Inspection not found.' }, 404);
		}

		return context.json({ inspection });
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
	readonly getInspectionTile: InspectionTileReader;
}): ReadonlyMap<string, TileSetDefinition> {
	return new Map<string, TileSetDefinition>([
		[
			'habitats',
			defineTileSet<HabitatMvtTileFilters>({
				parseFilters: parseHabitatTileFilters,
				getTile: (db, input) =>
					options.getHabitatTile(db, {
						...input.coordinate,
						organizationId: input.organizationId,
						filters: input.filters,
					}),
			}),
		],
		[
			'inspections',
			defineTileSet<InspectionMvtTileFilters>({
				parseFilters: parseInspectionTileFilters,
				getTile: (db, input) =>
					options.getInspectionTile(db, {
						...input.coordinate,
						organizationId: input.organizationId,
						filters: input.filters,
					}),
			}),
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

const inspectionFilterParams = new Set([
	'isWet',
	'density',
	'positive',
	'habitatTypeId',
	'dateFrom',
	'dateTo',
]);

export function parseInspectionTileFilters(searchParams: URLSearchParams): InspectionFilterResult {
	const unknownParams = [...searchParams.keys()].filter(
		(param) => !inspectionFilterParams.has(param),
	);
	if (unknownParams.length > 0) {
		return { ok: false, reason: `Unsupported inspection tile filter: ${unknownParams[0]}.` };
	}

	const isWet = parseOptionalBooleanFilter(searchParams, 'isWet');
	if (!isWet.ok) {
		return isWet;
	}

	const positive = parseOptionalBooleanFilter(searchParams, 'positive');
	if (!positive.ok) {
		return positive;
	}

	const densities = parseOptionalDensityListFilter(searchParams, 'density');
	if (!densities.ok) {
		return densities;
	}

	const habitatTypeIds = parseOptionalUuidListFilter(searchParams, 'habitatTypeId');
	if (!habitatTypeIds.ok) {
		return habitatTypeIds;
	}

	const dateFrom = parseOptionalDateFilter(searchParams, 'dateFrom');
	if (!dateFrom.ok) {
		return dateFrom;
	}

	const dateTo = parseOptionalDateFilter(searchParams, 'dateTo');
	if (!dateTo.ok) {
		return dateTo;
	}

	return {
		ok: true,
		filters: {
			...(isWet.value === undefined ? {} : { isWet: isWet.value }),
			...(densities.value === undefined ? {} : { densities: densities.value }),
			...(positive.value === undefined ? {} : { positiveOnly: positive.value }),
			...(habitatTypeIds.value === undefined ? {} : { habitatTypeIds: habitatTypeIds.value }),
			...(dateFrom.value === undefined ? {} : { dateFrom: dateFrom.value }),
			...(dateTo.value === undefined ? {} : { dateTo: dateTo.value }),
		},
	};
}

export function parseInspectionDisplayQuery(
	searchParams: URLSearchParams,
	organizationId: string,
): InspectionDisplayQueryResult {
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

	const filterResult = parseInspectionTileFilters(filterParams);
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

const maxHabitatIds = 500;
const maxSearchResults = 25;

function parseHabitatSearchQuery(
	searchParams: URLSearchParams,
):
	| { readonly ok: true; readonly search: string; readonly limit: number }
	| { readonly ok: false; readonly reason: string } {
	const search = parseOptionalTextFilter(searchParams, 'q');
	if (!search.ok) {
		return search;
	}

	const rawLimit = searchParams.get('limit');
	if (rawLimit === null || rawLimit.trim() === '') {
		return { ok: true, search: search.value ?? '', limit: maxSearchResults };
	}
	const parsed = parseInteger(rawLimit);
	if (parsed === null || parsed < 1 || parsed > maxSearchResults) {
		return { ok: false, reason: `limit must be between 1 and ${maxSearchResults}.` };
	}
	return { ok: true, search: search.value ?? '', limit: parsed };
}

function parseHabitatIdsParam(
	searchParams: URLSearchParams,
):
	| { readonly ok: true; readonly ids: readonly string[] }
	| { readonly ok: false; readonly reason: string } {
	const result = parseOptionalUuidListFilter(searchParams, 'ids');
	if (!result.ok) {
		return result;
	}
	const ids = result.value ?? [];
	if (ids.length > maxHabitatIds) {
		return { ok: false, reason: `ids must contain ${maxHabitatIds} or fewer values.` };
	}
	return { ok: true, ids };
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

const inspectionDensitySet = new Set<string>(inspectionDensityValues);

function parseOptionalDensityListFilter(
	searchParams: URLSearchParams,
	param: string,
):
	| { readonly ok: true; readonly value: readonly InspectionDensity[] | undefined }
	| { readonly ok: false; readonly reason: string } {
	const values = searchParams
		.getAll(param)
		.flatMap((value) => value.split(','))
		.map((value) => value.trim())
		.filter((value) => value.length > 0);

	if (values.length === 0) {
		return searchParams.has(param)
			? { ok: false, reason: `${param} must include at least one value.` }
			: { ok: true, value: undefined };
	}

	for (const value of values) {
		if (!inspectionDensitySet.has(value)) {
			return {
				ok: false,
				reason: `${param} must be one of: ${inspectionDensityValues.join(', ')}.`,
			};
		}
	}

	return { ok: true, value: [...new Set(values)] as InspectionDensity[] };
}

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function parseOptionalDateFilter(
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
	// Shape check plus a real calendar-validity check (rejects e.g. 2026-13-40).
	if (!isoDatePattern.test(trimmed) || Number.isNaN(Date.parse(`${trimmed}T00:00:00Z`))) {
		return { ok: false, reason: `${param} must be a valid YYYY-MM-DD date.` };
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
