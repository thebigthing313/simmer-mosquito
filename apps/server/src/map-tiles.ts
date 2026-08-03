import {
	type AddressMvtTileFilters,
	type AddressMvtTileInput,
	type ApplicationByIdInput,
	type ApplicationMapFilters,
	type ApplicationMvtTileInput,
	type ApplicationPageInput,
	type ApplicationPageResult,
	type BiocontrolByIdInput,
	type BiocontrolMapFilters,
	type BiocontrolMvtTileInput,
	type BiocontrolPageInput,
	type BiocontrolPageResult,
	type CollectionByIdInput,
	type CollectionMapFilters,
	type CollectionMvtTileInput,
	type CollectionPageInput,
	type CollectionPageResult,
	countActiveHabitatsByType,
	getAddressById,
	getAddressMapExtent,
	getAddressMvtTile,
	getApplicationDisplayRowById,
	getApplicationMapExtent,
	getApplicationMvtTile,
	getBiocontrolDisplayRowById,
	getBiocontrolMapExtent,
	getBiocontrolMvtTile,
	getCollectionDisplayRowById,
	getCollectionMapExtent,
	getCollectionMvtTile,
	getHabitatDisplayRowById,
	getHabitatMapExtent,
	getHabitatMvtTile,
	getInspectionDisplayRowById,
	getInspectionMapExtent,
	getInspectionMvtTile,
	getOutreachDisplayRowById,
	getOutreachMapExtent,
	getOutreachMvtTile,
	getRegionById,
	getRegionMapExtent,
	getRegionMvtTile,
	getSampleDisplayRowById,
	getSampleMapExtent,
	getSampleMvtTile,
	getSourceReductionDisplayRowById,
	getSourceReductionMapExtent,
	getSourceReductionMvtTile,
	getTrapDisplayRowById,
	getTrapMapExtent,
	getTrapMvtTile,
	type HabitatByIdInput,
	type HabitatDisplayPageResult,
	type HabitatMvtTileFilters,
	type HabitatMvtTileInput,
	type HabitatSearchInput,
	type HabitatSiteDisplayRow,
	type HabitatsByIdsInput,
	type HabitatTypeUsageRow,
	type InspectionByIdInput,
	type InspectionDensity,
	type InspectionDisplayPageResult,
	type InspectionMvtTileFilters,
	type InspectionMvtTileInput,
	inspectionDensityValues,
	type Kysely,
	listApplicationDisplayRowsPage,
	listBiocontrolDisplayRowsPage,
	listCollectionDisplayRowsPage,
	listHabitatDisplayRowsByBounds,
	listHabitatDisplayRowsByIds,
	listInspectionDisplayRowsByBounds,
	listOutreachDisplayRowsPage,
	listSampleDisplayRowsByBounds,
	listSourceReductionDisplayRowsPage,
	listTrapDisplayRowsPage,
	type MapExtent,
	type OutreachByIdInput,
	type OutreachMapFilters,
	type OutreachMvtTileInput,
	type OutreachPageInput,
	type OutreachPageResult,
	type RegionMvtTileFilters,
	type RegionMvtTileInput,
	type SafeApplicationDisplayRow,
	type SafeBiocontrolDisplayRow,
	type SafeCollectionDisplayRow,
	type SafeHabitatDisplayRow,
	type SafeInspectionDisplayRow,
	type SafeOutreachDisplayRow,
	type SafeSampleDisplayRow,
	type SafeSourceReductionDisplayRow,
	type SafeTrapDisplayRow,
	type SampleByIdInput,
	type SampleDisplayPageResult,
	type SampleListFilters,
	type SampleMvtTileInput,
	type SampleStatus,
	type SimmerDatabase,
	type SourceReductionByIdInput,
	type SourceReductionMapFilters,
	type SourceReductionMvtTileInput,
	type SourceReductionPageInput,
	type SourceReductionPageResult,
	sampleStatusValues,
	searchHabitatSites,
	type TrapByIdInput,
	type TrapMapFilters,
	type TrapMvtTileInput,
	type TrapPageInput,
	type TrapPageResult,
} from '@simmer-mosquito/db';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';

// Route site + search readers registered below the literal habitat map routes.
const mvtContentType = 'application/vnd.mapbox-vector-tile';
const maxSupportedZoom = 22;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The region narrowing every map surface accepts. Regions are the agency's own
 * operational geography, so "only this district" is asked of habitats, traps,
 * applications, and everything else alike — one param name across every tileset
 * keeps a deep link from one explorer readable by the next.
 */
const regionFilterParam = 'regionId';

type TileDb = Kysely<SimmerDatabase>;
type HabitatTileReader = (db: TileDb, input: HabitatMvtTileInput) => Promise<Uint8Array>;
type RegionTileReader = (db: TileDb, input: RegionMvtTileInput) => Promise<Uint8Array>;
type AddressTileReader = (db: TileDb, input: AddressMvtTileInput) => Promise<Uint8Array>;
type HabitatDisplayReader = (
	db: TileDb,
	input: HabitatDisplayInput,
) => Promise<HabitatDisplayPageResult>;
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
) => Promise<InspectionDisplayPageResult>;
type InspectionDisplayByIdReader = (
	db: TileDb,
	input: InspectionByIdInput,
) => Promise<SafeInspectionDisplayRow | undefined>;
type SampleTileReader = (db: TileDb, input: SampleMvtTileInput) => Promise<Uint8Array>;
type SampleDisplayReader = (
	db: TileDb,
	input: SampleDisplayInput,
) => Promise<SampleDisplayPageResult>;
type SampleDisplayByIdReader = (
	db: TileDb,
	input: SampleByIdInput,
) => Promise<SafeSampleDisplayRow | undefined>;
type ApplicationTileReader = (db: TileDb, input: ApplicationMvtTileInput) => Promise<Uint8Array>;
type ApplicationPageReader = (
	db: TileDb,
	input: ApplicationPageInput,
) => Promise<ApplicationPageResult>;
type ApplicationDisplayByIdReader = (
	db: TileDb,
	input: ApplicationByIdInput,
) => Promise<SafeApplicationDisplayRow | undefined>;
type SourceReductionTileReader = (
	db: TileDb,
	input: SourceReductionMvtTileInput,
) => Promise<Uint8Array>;
type SourceReductionPageReader = (
	db: TileDb,
	input: SourceReductionPageInput,
) => Promise<SourceReductionPageResult>;
type SourceReductionDisplayByIdReader = (
	db: TileDb,
	input: SourceReductionByIdInput,
) => Promise<SafeSourceReductionDisplayRow | undefined>;
type BiocontrolTileReader = (db: TileDb, input: BiocontrolMvtTileInput) => Promise<Uint8Array>;
type BiocontrolPageReader = (
	db: TileDb,
	input: BiocontrolPageInput,
) => Promise<BiocontrolPageResult>;
type BiocontrolDisplayByIdReader = (
	db: TileDb,
	input: BiocontrolByIdInput,
) => Promise<SafeBiocontrolDisplayRow | undefined>;
type OutreachTileReader = (db: TileDb, input: OutreachMvtTileInput) => Promise<Uint8Array>;
type OutreachPageReader = (db: TileDb, input: OutreachPageInput) => Promise<OutreachPageResult>;
type OutreachDisplayByIdReader = (
	db: TileDb,
	input: OutreachByIdInput,
) => Promise<SafeOutreachDisplayRow | undefined>;
type TrapTileReader = (db: TileDb, input: TrapMvtTileInput) => Promise<Uint8Array>;
type TrapPageReader = (db: TileDb, input: TrapPageInput) => Promise<TrapPageResult>;
type TrapDisplayByIdReader = (
	db: TileDb,
	input: TrapByIdInput,
) => Promise<SafeTrapDisplayRow | undefined>;
type CollectionTileReader = (db: TileDb, input: CollectionMvtTileInput) => Promise<Uint8Array>;
type CollectionPageReader = (
	db: TileDb,
	input: CollectionPageInput,
) => Promise<CollectionPageResult>;
type CollectionDisplayByIdReader = (
	db: TileDb,
	input: CollectionByIdInput,
) => Promise<SafeCollectionDisplayRow | undefined>;

/**
 * Reads the extent of one tileset's filtered rows, viewport-free. Paired with a
 * tile reader in the registry below so a tileset can never frame one filter set
 * while drawing another.
 */
type MapExtentReader<F> = (
	db: TileDb,
	input: { readonly organizationId: string; readonly filters?: F },
) => Promise<MapExtent | null>;

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
	readonly offset: number;
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
	readonly offset: number;
}

type SampleFilterResult =
	| { readonly ok: true; readonly filters: SampleListFilters }
	| { readonly ok: false; readonly reason: string };

type SampleDisplayQueryResult =
	| { readonly ok: true; readonly input: SampleDisplayInput }
	| { readonly ok: false; readonly reason: string };

interface SampleDisplayInput {
	readonly organizationId: string;
	readonly bounds: MapBounds;
	readonly filters?: SampleListFilters;
	readonly limit: number;
	readonly offset: number;
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
	readonly getExtent: (
		db: TileDb,
		input: {
			readonly organizationId: string;
			readonly filters: unknown;
		},
	) => Promise<MapExtent | null>;
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
	readonly getExtent: (
		db: TileDb,
		input: {
			readonly organizationId: string;
			readonly filters: F;
		},
	) => Promise<MapExtent | null>;
}): TileSetDefinition {
	return def as unknown as TileSetDefinition;
}

export function registerMapTileRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: TileDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
		readonly getHabitatTile?: HabitatTileReader;
		readonly getRegionTile?: RegionTileReader;
		readonly getAddressTile?: AddressTileReader;
		readonly listHabitatDisplayRows?: HabitatDisplayReader;
		readonly getHabitatDisplayRow?: HabitatDisplayByIdReader;
		readonly listHabitatDisplayRowsByIds?: HabitatDisplayByIdsReader;
		readonly searchHabitatDisplayRows?: HabitatSearchReader;
		readonly countHabitatTypeUsage?: HabitatTypeUsageReader;
		readonly getInspectionTile?: InspectionTileReader;
		readonly listInspectionDisplayRows?: InspectionDisplayReader;
		readonly getInspectionDisplayRow?: InspectionDisplayByIdReader;
		readonly getSampleTile?: SampleTileReader;
		readonly listSampleDisplayRows?: SampleDisplayReader;
		readonly getSampleDisplayRow?: SampleDisplayByIdReader;
		readonly getApplicationTile?: ApplicationTileReader;
		readonly listApplicationDisplayRows?: ApplicationPageReader;
		readonly getApplicationDisplayRow?: ApplicationDisplayByIdReader;
		readonly getSourceReductionTile?: SourceReductionTileReader;
		readonly listSourceReductionDisplayRows?: SourceReductionPageReader;
		readonly getSourceReductionDisplayRow?: SourceReductionDisplayByIdReader;
		readonly getBiocontrolTile?: BiocontrolTileReader;
		readonly listBiocontrolDisplayRows?: BiocontrolPageReader;
		readonly getBiocontrolDisplayRow?: BiocontrolDisplayByIdReader;
		readonly getOutreachTile?: OutreachTileReader;
		readonly listOutreachDisplayRows?: OutreachPageReader;
		readonly getOutreachDisplayRow?: OutreachDisplayByIdReader;
		readonly getTrapTile?: TrapTileReader;
		readonly listTrapDisplayRows?: TrapPageReader;
		readonly getTrapDisplayRow?: TrapDisplayByIdReader;
		readonly getCollectionTile?: CollectionTileReader;
		readonly listCollectionDisplayRows?: CollectionPageReader;
		readonly getCollectionDisplayRow?: CollectionDisplayByIdReader;
		readonly getHabitatExtent?: MapExtentReader<HabitatMvtTileFilters>;
		readonly getRegionExtent?: MapExtentReader<RegionMvtTileFilters>;
		readonly getAddressExtent?: MapExtentReader<AddressMvtTileFilters>;
		readonly getInspectionExtent?: MapExtentReader<InspectionMvtTileFilters>;
		readonly getSampleExtent?: MapExtentReader<SampleListFilters>;
		readonly getApplicationExtent?: MapExtentReader<ApplicationMapFilters>;
		readonly getSourceReductionExtent?: MapExtentReader<SourceReductionMapFilters>;
		readonly getBiocontrolExtent?: MapExtentReader<BiocontrolMapFilters>;
		readonly getOutreachExtent?: MapExtentReader<OutreachMapFilters>;
		readonly getTrapExtent?: MapExtentReader<TrapMapFilters>;
		readonly getCollectionExtent?: MapExtentReader<CollectionMapFilters>;
	},
): void {
	const tileSets = createTileSetRegistry({
		getHabitatTile: options.getHabitatTile ?? getHabitatMvtTile,
		getRegionTile: options.getRegionTile ?? getRegionMvtTile,
		getAddressTile: options.getAddressTile ?? getAddressMvtTile,
		getInspectionTile: options.getInspectionTile ?? getInspectionMvtTile,
		getSampleTile: options.getSampleTile ?? getSampleMvtTile,
		getApplicationTile: options.getApplicationTile ?? getApplicationMvtTile,
		getSourceReductionTile: options.getSourceReductionTile ?? getSourceReductionMvtTile,
		getBiocontrolTile: options.getBiocontrolTile ?? getBiocontrolMvtTile,
		getOutreachTile: options.getOutreachTile ?? getOutreachMvtTile,
		getTrapTile: options.getTrapTile ?? getTrapMvtTile,
		getCollectionTile: options.getCollectionTile ?? getCollectionMvtTile,
		getHabitatExtent: options.getHabitatExtent ?? getHabitatMapExtent,
		getRegionExtent: options.getRegionExtent ?? getRegionMapExtent,
		getAddressExtent: options.getAddressExtent ?? getAddressMapExtent,
		getInspectionExtent: options.getInspectionExtent ?? getInspectionMapExtent,
		getSampleExtent: options.getSampleExtent ?? getSampleMapExtent,
		getApplicationExtent: options.getApplicationExtent ?? getApplicationMapExtent,
		getSourceReductionExtent: options.getSourceReductionExtent ?? getSourceReductionMapExtent,
		getBiocontrolExtent: options.getBiocontrolExtent ?? getBiocontrolMapExtent,
		getOutreachExtent: options.getOutreachExtent ?? getOutreachMapExtent,
		getTrapExtent: options.getTrapExtent ?? getTrapMapExtent,
		getCollectionExtent: options.getCollectionExtent ?? getCollectionMapExtent,
	});
	const listDisplayRows = options.listHabitatDisplayRows ?? listHabitatDisplayRowsByBounds;
	const getDisplayRow = options.getHabitatDisplayRow ?? getHabitatDisplayRowById;
	const listDisplayRowsByIds = options.listHabitatDisplayRowsByIds ?? listHabitatDisplayRowsByIds;
	const searchDisplayRows = options.searchHabitatDisplayRows ?? searchHabitatSites;
	const countTypeUsage = options.countHabitatTypeUsage ?? countActiveHabitatsByType;
	const listInspectionRows = options.listInspectionDisplayRows ?? listInspectionDisplayRowsByBounds;
	const getInspectionRow = options.getInspectionDisplayRow ?? getInspectionDisplayRowById;
	const listSampleRows = options.listSampleDisplayRows ?? listSampleDisplayRowsByBounds;
	const getSampleRow = options.getSampleDisplayRow ?? getSampleDisplayRowById;
	const listApplicationRows = options.listApplicationDisplayRows ?? listApplicationDisplayRowsPage;
	const getApplicationRow = options.getApplicationDisplayRow ?? getApplicationDisplayRowById;
	const listSourceReductionRows =
		options.listSourceReductionDisplayRows ?? listSourceReductionDisplayRowsPage;
	const getSourceReductionRow =
		options.getSourceReductionDisplayRow ?? getSourceReductionDisplayRowById;
	const listBiocontrolRows = options.listBiocontrolDisplayRows ?? listBiocontrolDisplayRowsPage;
	const getBiocontrolRow = options.getBiocontrolDisplayRow ?? getBiocontrolDisplayRowById;
	const listOutreachRows = options.listOutreachDisplayRows ?? listOutreachDisplayRowsPage;
	const getOutreachRow = options.getOutreachDisplayRow ?? getOutreachDisplayRowById;
	const listTrapRows = options.listTrapDisplayRows ?? listTrapDisplayRowsPage;
	const getTrapRow = options.getTrapDisplayRow ?? getTrapDisplayRowById;
	const listCollectionRows = options.listCollectionDisplayRows ?? listCollectionDisplayRowsPage;
	const getCollectionRow = options.getCollectionDisplayRow ?? getCollectionDisplayRowById;

	app.get('/map/habitats', options.authContextMiddleware, async (context) => {
		const authContext = context.get('authContext');
		const queryResult = parseHabitatDisplayQuery(
			new URL(context.req.url).searchParams,
			authContext.organization.id,
		);

		if (!queryResult.ok) {
			return context.json({ error: 'invalid_query', reason: queryResult.reason }, 400);
		}

		const page = await listDisplayRows(options.db, queryResult.input);

		return context.json({ habitats: page.rows, total: page.total });
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

	// Region + address geometry is deliberately excluded from the Electric sync
	// shapes (the on-demand rows carry no geometry), so detail views read the
	// polygon/point over HTTP the same way habitats do.
	app.get('/map/regions/:id', options.authContextMiddleware, async (context) => {
		const id = context.req.param('id');
		if (!uuidPattern.test(id)) {
			return context.json({ error: 'invalid_id', reason: 'Region id must be a UUID.' }, 400);
		}

		const authContext = context.get('authContext');
		const region = await getRegionById(options.db, {
			id,
			organizationId: authContext.organization.id,
		});

		if (region === undefined) {
			return context.json({ error: 'not_found', reason: 'Region not found.' }, 404);
		}

		return context.json({ region: { ...region.geometry } });
	});

	app.get('/map/addresses/:id', options.authContextMiddleware, async (context) => {
		const id = context.req.param('id');
		if (!uuidPattern.test(id)) {
			return context.json({ error: 'invalid_id', reason: 'Address id must be a UUID.' }, 400);
		}

		const authContext = context.get('authContext');
		const address = await getAddressById(options.db, {
			id,
			organizationId: authContext.organization.id,
		});

		if (address === undefined) {
			return context.json({ error: 'not_found', reason: 'Address not found.' }, 404);
		}

		return context.json({ address: { ...address.geometry } });
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

		const page = await listInspectionRows(options.db, queryResult.input);

		return context.json({ inspections: page.rows, total: page.total });
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

	app.get('/map/samples', options.authContextMiddleware, async (context) => {
		const authContext = context.get('authContext');
		const queryResult = parseSampleDisplayQuery(
			new URL(context.req.url).searchParams,
			authContext.organization.id,
		);

		if (!queryResult.ok) {
			return context.json({ error: 'invalid_query', reason: queryResult.reason }, 400);
		}

		const page = await listSampleRows(options.db, queryResult.input);

		return context.json({ samples: page.rows, total: page.total });
	});

	app.get('/map/samples/:id', options.authContextMiddleware, async (context) => {
		const id = context.req.param('id');
		if (!uuidPattern.test(id)) {
			return context.json({ error: 'invalid_id', reason: 'Sample id must be a UUID.' }, 400);
		}

		const authContext = context.get('authContext');
		const sample = await getSampleRow(options.db, {
			id,
			organizationId: authContext.organization.id,
		});

		if (sample === undefined) {
			return context.json({ error: 'not_found', reason: 'Sample not found.' }, 404);
		}

		return context.json({ sample });
	});

	app.get('/map/chemical', options.authContextMiddleware, async (context) => {
		const authContext = context.get('authContext');
		const queryResult = parseApplicationPageQuery(
			new URL(context.req.url).searchParams,
			authContext.organization.id,
		);

		if (!queryResult.ok) {
			return context.json({ error: 'invalid_query', reason: queryResult.reason }, 400);
		}

		const page = await listApplicationRows(options.db, queryResult.input);

		return context.json({ applications: page.rows, total: page.total });
	});

	app.get('/map/chemical/:id', options.authContextMiddleware, async (context) => {
		const id = context.req.param('id');
		if (!uuidPattern.test(id)) {
			return context.json({ error: 'invalid_id', reason: 'Application id must be a UUID.' }, 400);
		}

		const authContext = context.get('authContext');
		const application = await getApplicationRow(options.db, {
			id,
			organizationId: authContext.organization.id,
		});

		if (application === undefined) {
			return context.json({ error: 'not_found', reason: 'Application not found.' }, 404);
		}

		return context.json({ application });
	});

	app.get('/map/source-reduction', options.authContextMiddleware, async (context) => {
		const authContext = context.get('authContext');
		const queryResult = parseSourceReductionPageQuery(
			new URL(context.req.url).searchParams,
			authContext.organization.id,
		);

		if (!queryResult.ok) {
			return context.json({ error: 'invalid_query', reason: queryResult.reason }, 400);
		}

		const page = await listSourceReductionRows(options.db, queryResult.input);

		return context.json({ sourceReductions: page.rows, total: page.total });
	});

	app.get('/map/source-reduction/:id', options.authContextMiddleware, async (context) => {
		const id = context.req.param('id');
		if (!uuidPattern.test(id)) {
			return context.json(
				{ error: 'invalid_id', reason: 'Source reduction id must be a UUID.' },
				400,
			);
		}

		const authContext = context.get('authContext');
		const sourceReduction = await getSourceReductionRow(options.db, {
			id,
			organizationId: authContext.organization.id,
		});

		if (sourceReduction === undefined) {
			return context.json({ error: 'not_found', reason: 'Source reduction not found.' }, 404);
		}

		return context.json({ sourceReduction });
	});

	app.get('/map/biocontrol', options.authContextMiddleware, async (context) => {
		const authContext = context.get('authContext');
		const queryResult = parseBiocontrolPageQuery(
			new URL(context.req.url).searchParams,
			authContext.organization.id,
		);

		if (!queryResult.ok) {
			return context.json({ error: 'invalid_query', reason: queryResult.reason }, 400);
		}

		const page = await listBiocontrolRows(options.db, queryResult.input);

		return context.json({ biocontrolActions: page.rows, total: page.total });
	});

	app.get('/map/biocontrol/:id', options.authContextMiddleware, async (context) => {
		const id = context.req.param('id');
		if (!uuidPattern.test(id)) {
			return context.json({ error: 'invalid_id', reason: 'Biocontrol id must be a UUID.' }, 400);
		}

		const authContext = context.get('authContext');
		const biocontrolAction = await getBiocontrolRow(options.db, {
			id,
			organizationId: authContext.organization.id,
		});

		if (biocontrolAction === undefined) {
			return context.json({ error: 'not_found', reason: 'Biocontrol action not found.' }, 404);
		}

		return context.json({ biocontrolAction });
	});

	app.get('/map/outreach', options.authContextMiddleware, async (context) => {
		const authContext = context.get('authContext');
		const queryResult = parseOutreachPageQuery(
			new URL(context.req.url).searchParams,
			authContext.organization.id,
		);

		if (!queryResult.ok) {
			return context.json({ error: 'invalid_query', reason: queryResult.reason }, 400);
		}

		const page = await listOutreachRows(options.db, queryResult.input);

		return context.json({ outreachActions: page.rows, total: page.total });
	});

	app.get('/map/outreach/:id', options.authContextMiddleware, async (context) => {
		const id = context.req.param('id');
		if (!uuidPattern.test(id)) {
			return context.json({ error: 'invalid_id', reason: 'Outreach id must be a UUID.' }, 400);
		}

		const authContext = context.get('authContext');
		const outreachAction = await getOutreachRow(options.db, {
			id,
			organizationId: authContext.organization.id,
		});

		if (outreachAction === undefined) {
			return context.json({ error: 'not_found', reason: 'Outreach action not found.' }, 404);
		}

		return context.json({ outreachAction });
	});

	app.get('/map/traps', options.authContextMiddleware, async (context) => {
		const authContext = context.get('authContext');
		const queryResult = parseTrapPageQuery(
			new URL(context.req.url).searchParams,
			authContext.organization.id,
		);

		if (!queryResult.ok) {
			return context.json({ error: 'invalid_query', reason: queryResult.reason }, 400);
		}

		const page = await listTrapRows(options.db, queryResult.input);

		return context.json({ traps: page.rows, total: page.total });
	});

	app.get('/map/traps/:id', options.authContextMiddleware, async (context) => {
		const id = context.req.param('id');
		if (!uuidPattern.test(id)) {
			return context.json({ error: 'invalid_id', reason: 'Trap id must be a UUID.' }, 400);
		}

		const authContext = context.get('authContext');
		const trap = await getTrapRow(options.db, {
			id,
			organizationId: authContext.organization.id,
		});

		if (trap === undefined) {
			return context.json({ error: 'not_found', reason: 'Trap not found.' }, 404);
		}

		return context.json({ trap });
	});

	app.get('/map/collections', options.authContextMiddleware, async (context) => {
		const authContext = context.get('authContext');
		const queryResult = parseCollectionPageQuery(
			new URL(context.req.url).searchParams,
			authContext.organization.id,
		);

		if (!queryResult.ok) {
			return context.json({ error: 'invalid_query', reason: queryResult.reason }, 400);
		}

		const page = await listCollectionRows(options.db, queryResult.input);

		return context.json({ collections: page.rows, total: page.total });
	});

	app.get('/map/collections/:id', options.authContextMiddleware, async (context) => {
		const id = context.req.param('id');
		if (!uuidPattern.test(id)) {
			return context.json({ error: 'invalid_id', reason: 'Collection id must be a UUID.' }, 400);
		}

		const authContext = context.get('authContext');
		const collection = await getCollectionRow(options.db, {
			id,
			organizationId: authContext.organization.id,
		});

		if (collection === undefined) {
			return context.json({ error: 'not_found', reason: 'Collection not found.' }, 404);
		}

		return context.json({ collection });
	});

	// The bounding box of everything the same filters would draw, viewport-free.
	// An explorer map frames this on load and whenever its filters change, since
	// vector tiles alone can never tell the client where the filtered records are.
	// Registered before the tile route; the literal `extent` segment can't collide
	// with the tile route's longer `z/x/y` path.
	app.get('/map/tiles/:tileset/extent', options.authContextMiddleware, async (context) => {
		const tileset = context.req.param('tileset');
		const tileSet = tileSets.get(tileset);
		if (tileSet === undefined) {
			return context.json({ error: 'invalid_tileset', reason: 'Unknown map tileset.' }, 400);
		}

		const filterResult = tileSet.parseFilters(new URL(context.req.url).searchParams);
		if (!filterResult.ok) {
			return context.json({ error: 'invalid_filter', reason: filterResult.reason }, 400);
		}

		const authContext = context.get('authContext');
		const extent = await tileSet.getExtent(options.db, {
			organizationId: authContext.organization.id,
			filters: filterResult.filters,
		});

		// A null extent means nothing matched; the client leaves its camera alone.
		return context.json({ extent });
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
	readonly getRegionTile: RegionTileReader;
	readonly getAddressTile: AddressTileReader;
	readonly getInspectionTile: InspectionTileReader;
	readonly getSampleTile: SampleTileReader;
	readonly getApplicationTile: ApplicationTileReader;
	readonly getSourceReductionTile: SourceReductionTileReader;
	readonly getBiocontrolTile: BiocontrolTileReader;
	readonly getOutreachTile: OutreachTileReader;
	readonly getTrapTile: TrapTileReader;
	readonly getCollectionTile: CollectionTileReader;
	readonly getHabitatExtent: MapExtentReader<HabitatMvtTileFilters>;
	readonly getRegionExtent: MapExtentReader<RegionMvtTileFilters>;
	readonly getAddressExtent: MapExtentReader<AddressMvtTileFilters>;
	readonly getInspectionExtent: MapExtentReader<InspectionMvtTileFilters>;
	readonly getSampleExtent: MapExtentReader<SampleListFilters>;
	readonly getApplicationExtent: MapExtentReader<ApplicationMapFilters>;
	readonly getSourceReductionExtent: MapExtentReader<SourceReductionMapFilters>;
	readonly getBiocontrolExtent: MapExtentReader<BiocontrolMapFilters>;
	readonly getOutreachExtent: MapExtentReader<OutreachMapFilters>;
	readonly getTrapExtent: MapExtentReader<TrapMapFilters>;
	readonly getCollectionExtent: MapExtentReader<CollectionMapFilters>;
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
				getExtent: (db, input) => options.getHabitatExtent(db, input),
			}),
		],
		[
			'regions',
			defineTileSet<RegionMvtTileFilters>({
				parseFilters: parseRegionTileFilters,
				getTile: (db, input) =>
					options.getRegionTile(db, {
						...input.coordinate,
						organizationId: input.organizationId,
						filters: input.filters,
					}),
				getExtent: (db, input) => options.getRegionExtent(db, input),
			}),
		],
		[
			'addresses',
			defineTileSet<AddressMvtTileFilters>({
				parseFilters: parseAddressTileFilters,
				getTile: (db, input) =>
					options.getAddressTile(db, {
						...input.coordinate,
						organizationId: input.organizationId,
						filters: input.filters,
					}),
				getExtent: (db, input) => options.getAddressExtent(db, input),
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
				getExtent: (db, input) => options.getInspectionExtent(db, input),
			}),
		],
		[
			'samples',
			defineTileSet<SampleListFilters>({
				parseFilters: parseSampleTileFilters,
				getTile: (db, input) =>
					options.getSampleTile(db, {
						...input.coordinate,
						organizationId: input.organizationId,
						filters: input.filters,
					}),
				getExtent: (db, input) => options.getSampleExtent(db, input),
			}),
		],
		[
			'chemical',
			defineTileSet<ApplicationMapFilters>({
				parseFilters: parseApplicationMapFilters,
				getTile: (db, input) =>
					options.getApplicationTile(db, {
						...input.coordinate,
						organizationId: input.organizationId,
						filters: input.filters,
					}),
				getExtent: (db, input) => options.getApplicationExtent(db, input),
			}),
		],
		[
			'source-reduction',
			defineTileSet<SourceReductionMapFilters>({
				parseFilters: parseSourceReductionMapFilters,
				getTile: (db, input) =>
					options.getSourceReductionTile(db, {
						...input.coordinate,
						organizationId: input.organizationId,
						filters: input.filters,
					}),
				getExtent: (db, input) => options.getSourceReductionExtent(db, input),
			}),
		],
		[
			'biocontrol',
			defineTileSet<BiocontrolMapFilters>({
				parseFilters: parseBiocontrolMapFilters,
				getTile: (db, input) =>
					options.getBiocontrolTile(db, {
						...input.coordinate,
						organizationId: input.organizationId,
						filters: input.filters,
					}),
				getExtent: (db, input) => options.getBiocontrolExtent(db, input),
			}),
		],
		[
			'outreach',
			defineTileSet<OutreachMapFilters>({
				parseFilters: parseOutreachMapFilters,
				getTile: (db, input) =>
					options.getOutreachTile(db, {
						...input.coordinate,
						organizationId: input.organizationId,
						filters: input.filters,
					}),
				getExtent: (db, input) => options.getOutreachExtent(db, input),
			}),
		],
		[
			'traps',
			defineTileSet<TrapMapFilters>({
				parseFilters: parseTrapMapFilters,
				getTile: (db, input) =>
					options.getTrapTile(db, {
						...input.coordinate,
						organizationId: input.organizationId,
						filters: input.filters,
					}),
				getExtent: (db, input) => options.getTrapExtent(db, input),
			}),
		],
		[
			'collections',
			defineTileSet<CollectionMapFilters>({
				parseFilters: parseCollectionMapFilters,
				getTile: (db, input) =>
					options.getCollectionTile(db, {
						...input.coordinate,
						organizationId: input.organizationId,
						filters: input.filters,
					}),
				getExtent: (db, input) => options.getCollectionExtent(db, input),
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

	const regionIds = parseOptionalUuidListFilter(searchParams, regionFilterParam);
	if (!regionIds.ok) {
		return regionIds;
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
			...(regionIds.value === undefined ? {} : { regionIds: regionIds.value }),
			...(search.value === undefined ? {} : { search: search.value }),
		},
	};
}

type AddressFilterResult =
	| { readonly ok: true; readonly filters: AddressMvtTileFilters }
	| { readonly ok: false; readonly reason: string };

const addressFilterParams = new Set(['search', regionFilterParam]);

export function parseAddressTileFilters(searchParams: URLSearchParams): AddressFilterResult {
	const unknownParams = [...searchParams.keys()].filter((param) => !addressFilterParams.has(param));
	if (unknownParams.length > 0) {
		return { ok: false, reason: `Unsupported address tile filter: ${unknownParams[0]}.` };
	}

	const search = parseOptionalTextFilter(searchParams, 'search');
	if (!search.ok) {
		return search;
	}

	const regionIds = parseOptionalUuidListFilter(searchParams, regionFilterParam);
	if (!regionIds.ok) {
		return regionIds;
	}

	return {
		ok: true,
		filters: {
			...(search.value === undefined ? {} : { search: search.value }),
			...(regionIds.value === undefined ? {} : { regionIds: regionIds.value }),
		},
	};
}

type RegionFilterResult =
	| { readonly ok: true; readonly filters: RegionMvtTileFilters }
	| { readonly ok: false; readonly reason: string };

const regionFilterParams = new Set(['regionFolderId', 'search', 'id']);

export function parseRegionTileFilters(searchParams: URLSearchParams): RegionFilterResult {
	const unknownParams = [...searchParams.keys()].filter((param) => !regionFilterParams.has(param));
	if (unknownParams.length > 0) {
		return { ok: false, reason: `Unsupported region tile filter: ${unknownParams[0]}.` };
	}

	const regionFolderId = parseOptionalTextFilter(searchParams, 'regionFolderId');
	if (!regionFolderId.ok) {
		return regionFolderId;
	}

	const search = parseOptionalTextFilter(searchParams, 'search');
	if (!search.ok) {
		return search;
	}

	// The regions explorer draws one checkbox-picked set rather than every region
	// its other filters allow, so its extent request names the ids outright.
	const ids = parseOptionalUuidListFilter(searchParams, 'id');
	if (!ids.ok) {
		return ids;
	}

	return {
		ok: true,
		filters: {
			...(regionFolderId.value === undefined ? {} : { regionFolderId: regionFolderId.value }),
			...(search.value === undefined ? {} : { search: search.value }),
			...(ids.value === undefined ? {} : { ids: ids.value }),
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

	const offset = parseOffsetParam(searchParams.get('offset'));
	if (!offset.ok) {
		return offset;
	}

	const filterParams = new URLSearchParams(searchParams);
	filterParams.delete('bbox');
	filterParams.delete('limit');
	filterParams.delete('offset');

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
			offset: offset.value,
		},
	};
}

const inspectionFilterParams = new Set([
	'isWet',
	'density',
	'positive',
	'habitatTypeId',
	'inspectedBy',
	'dateFrom',
	'dateTo',
	regionFilterParam,
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

	const inspectedByProfileIds = parseOptionalUuidListFilter(searchParams, 'inspectedBy');
	if (!inspectedByProfileIds.ok) {
		return inspectedByProfileIds;
	}

	const regionIds = parseOptionalUuidListFilter(searchParams, regionFilterParam);
	if (!regionIds.ok) {
		return regionIds;
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
			...(inspectedByProfileIds.value === undefined
				? {}
				: { inspectedByProfileIds: inspectedByProfileIds.value }),
			...(regionIds.value === undefined ? {} : { regionIds: regionIds.value }),
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

	const offset = parseOffsetParam(searchParams.get('offset'));
	if (!offset.ok) {
		return offset;
	}

	const filterParams = new URLSearchParams(searchParams);
	filterParams.delete('bbox');
	filterParams.delete('limit');
	filterParams.delete('offset');

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
			offset: offset.value,
		},
	};
}

const sampleFilterParams = new Set([
	'species',
	'status',
	'nonMosquito',
	'dateFrom',
	'dateTo',
	regionFilterParam,
]);
const sampleStatusSet = new Set<string>(sampleStatusValues);

export function parseSampleTileFilters(searchParams: URLSearchParams): SampleFilterResult {
	const unknownParams = [...searchParams.keys()].filter((param) => !sampleFilterParams.has(param));
	if (unknownParams.length > 0) {
		return { ok: false, reason: `Unsupported sample tile filter: ${unknownParams[0]}.` };
	}

	const speciesIds = parseOptionalUuidListFilter(searchParams, 'species');
	if (!speciesIds.ok) {
		return speciesIds;
	}

	const status = parseOptionalSampleStatusFilter(searchParams, 'status');
	if (!status.ok) {
		return status;
	}

	const nonMosquito = parseOptionalBooleanFilter(searchParams, 'nonMosquito');
	if (!nonMosquito.ok) {
		return nonMosquito;
	}

	const regionIds = parseOptionalUuidListFilter(searchParams, regionFilterParam);
	if (!regionIds.ok) {
		return regionIds;
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
			...(speciesIds.value === undefined ? {} : { speciesIds: speciesIds.value }),
			...(status.value === undefined ? {} : { status: status.value }),
			// Only `true` narrows; `nonMosquito=false` is the same as omitting it.
			...(nonMosquito.value === true ? { nonMosquitoOnly: true } : {}),
			...(regionIds.value === undefined ? {} : { regionIds: regionIds.value }),
			...(dateFrom.value === undefined ? {} : { dateFrom: dateFrom.value }),
			...(dateTo.value === undefined ? {} : { dateTo: dateTo.value }),
		},
	};
}

export function parseSampleDisplayQuery(
	searchParams: URLSearchParams,
	organizationId: string,
): SampleDisplayQueryResult {
	const bbox = parseBoundingBoxParam(searchParams.get('bbox'));
	if (!bbox.ok) {
		return bbox;
	}

	const limit = parseLimitParam(searchParams.get('limit'));
	if (!limit.ok) {
		return limit;
	}

	const offset = parseOffsetParam(searchParams.get('offset'));
	if (!offset.ok) {
		return offset;
	}

	const filterParams = new URLSearchParams(searchParams);
	filterParams.delete('bbox');
	filterParams.delete('limit');
	filterParams.delete('offset');

	const filterResult = parseSampleTileFilters(filterParams);
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
			offset: offset.value,
		},
	};
}

// --- control-operations map queries -----------------------------------------
//
// These domains render their maps from unbounded MVT tiles, and their list from
// a filtered, offset-paged window (no bbox). Filters fold identically into the
// tile URL and the list query so the map and the paged rail stay in lockstep.

type ApplicationFilterResult =
	| { readonly ok: true; readonly filters: ApplicationMapFilters }
	| { readonly ok: false; readonly reason: string };

type ApplicationPageQueryResult =
	| { readonly ok: true; readonly input: ApplicationPageInput }
	| { readonly ok: false; readonly reason: string };

const applicationFilterParams = new Set([
	'insecticideId',
	'applicationMethodId',
	'applicator',
	'dateFrom',
	'dateTo',
	regionFilterParam,
]);

export function parseApplicationMapFilters(searchParams: URLSearchParams): ApplicationFilterResult {
	const unknownParams = [...searchParams.keys()].filter(
		(param) => !applicationFilterParams.has(param),
	);
	if (unknownParams.length > 0) {
		return { ok: false, reason: `Unsupported chemical filter: ${unknownParams[0]}.` };
	}

	const insecticideIds = parseOptionalUuidListFilter(searchParams, 'insecticideId');
	if (!insecticideIds.ok) {
		return insecticideIds;
	}

	const applicationMethodIds = parseOptionalUuidListFilter(searchParams, 'applicationMethodId');
	if (!applicationMethodIds.ok) {
		return applicationMethodIds;
	}

	const applicatorProfileIds = parseOptionalUuidListFilter(searchParams, 'applicator');
	if (!applicatorProfileIds.ok) {
		return applicatorProfileIds;
	}

	const regionIds = parseOptionalUuidListFilter(searchParams, regionFilterParam);
	if (!regionIds.ok) {
		return regionIds;
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
			...(insecticideIds.value === undefined ? {} : { insecticideIds: insecticideIds.value }),
			...(applicationMethodIds.value === undefined
				? {}
				: { applicationMethodIds: applicationMethodIds.value }),
			...(applicatorProfileIds.value === undefined
				? {}
				: { applicatorProfileIds: applicatorProfileIds.value }),
			...(regionIds.value === undefined ? {} : { regionIds: regionIds.value }),
			...(dateFrom.value === undefined ? {} : { dateFrom: dateFrom.value }),
			...(dateTo.value === undefined ? {} : { dateTo: dateTo.value }),
		},
	};
}

export function parseApplicationPageQuery(
	searchParams: URLSearchParams,
	organizationId: string,
): ApplicationPageQueryResult {
	const limit = parseLimitParam(searchParams.get('limit'));
	if (!limit.ok) {
		return limit;
	}

	const offset = parseOffsetParam(searchParams.get('offset'));
	if (!offset.ok) {
		return offset;
	}

	const filterParams = new URLSearchParams(searchParams);
	filterParams.delete('limit');
	filterParams.delete('offset');

	const filterResult = parseApplicationMapFilters(filterParams);
	if (!filterResult.ok) {
		return filterResult;
	}

	return {
		ok: true,
		input: {
			organizationId,
			filters: filterResult.filters,
			limit: limit.value,
			offset: offset.value,
		},
	};
}

type SourceReductionFilterResult =
	| { readonly ok: true; readonly filters: SourceReductionMapFilters }
	| { readonly ok: false; readonly reason: string };

type SourceReductionPageQueryResult =
	| { readonly ok: true; readonly input: SourceReductionPageInput }
	| { readonly ok: false; readonly reason: string };

const sourceReductionFilterParams = new Set([
	'sourceReductionMethodId',
	'technician',
	'dateFrom',
	'dateTo',
	regionFilterParam,
]);

export function parseSourceReductionMapFilters(
	searchParams: URLSearchParams,
): SourceReductionFilterResult {
	const unknownParams = [...searchParams.keys()].filter(
		(param) => !sourceReductionFilterParams.has(param),
	);
	if (unknownParams.length > 0) {
		return { ok: false, reason: `Unsupported source-reduction filter: ${unknownParams[0]}.` };
	}

	const sourceReductionMethodIds = parseOptionalUuidListFilter(
		searchParams,
		'sourceReductionMethodId',
	);
	if (!sourceReductionMethodIds.ok) {
		return sourceReductionMethodIds;
	}

	const technicianProfileIds = parseOptionalUuidListFilter(searchParams, 'technician');
	if (!technicianProfileIds.ok) {
		return technicianProfileIds;
	}

	const regionIds = parseOptionalUuidListFilter(searchParams, regionFilterParam);
	if (!regionIds.ok) {
		return regionIds;
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
			...(sourceReductionMethodIds.value === undefined
				? {}
				: { sourceReductionMethodIds: sourceReductionMethodIds.value }),
			...(technicianProfileIds.value === undefined
				? {}
				: { technicianProfileIds: technicianProfileIds.value }),
			...(regionIds.value === undefined ? {} : { regionIds: regionIds.value }),
			...(dateFrom.value === undefined ? {} : { dateFrom: dateFrom.value }),
			...(dateTo.value === undefined ? {} : { dateTo: dateTo.value }),
		},
	};
}

export function parseSourceReductionPageQuery(
	searchParams: URLSearchParams,
	organizationId: string,
): SourceReductionPageQueryResult {
	const limit = parseLimitParam(searchParams.get('limit'));
	if (!limit.ok) {
		return limit;
	}

	const offset = parseOffsetParam(searchParams.get('offset'));
	if (!offset.ok) {
		return offset;
	}

	const filterParams = new URLSearchParams(searchParams);
	filterParams.delete('limit');
	filterParams.delete('offset');

	const filterResult = parseSourceReductionMapFilters(filterParams);
	if (!filterResult.ok) {
		return filterResult;
	}

	return {
		ok: true,
		input: {
			organizationId,
			filters: filterResult.filters,
			limit: limit.value,
			offset: offset.value,
		},
	};
}

type BiocontrolFilterResult =
	| { readonly ok: true; readonly filters: BiocontrolMapFilters }
	| { readonly ok: false; readonly reason: string };

type BiocontrolPageQueryResult =
	| { readonly ok: true; readonly input: BiocontrolPageInput }
	| { readonly ok: false; readonly reason: string };

const biocontrolFilterParams = new Set([
	'biocontrolMethodId',
	'habitatLinked',
	'technician',
	'dateFrom',
	'dateTo',
	regionFilterParam,
]);

export function parseBiocontrolMapFilters(searchParams: URLSearchParams): BiocontrolFilterResult {
	const unknownParams = [...searchParams.keys()].filter(
		(param) => !biocontrolFilterParams.has(param),
	);
	if (unknownParams.length > 0) {
		return { ok: false, reason: `Unsupported biocontrol filter: ${unknownParams[0]}.` };
	}

	const biocontrolMethodIds = parseOptionalUuidListFilter(searchParams, 'biocontrolMethodId');
	if (!biocontrolMethodIds.ok) {
		return biocontrolMethodIds;
	}

	const habitatLinked = parseOptionalBooleanFilter(searchParams, 'habitatLinked');
	if (!habitatLinked.ok) {
		return habitatLinked;
	}

	const biocontrolTechnicianProfileIds = parseOptionalUuidListFilter(searchParams, 'technician');
	if (!biocontrolTechnicianProfileIds.ok) {
		return biocontrolTechnicianProfileIds;
	}

	const regionIds = parseOptionalUuidListFilter(searchParams, regionFilterParam);
	if (!regionIds.ok) {
		return regionIds;
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
			...(biocontrolMethodIds.value === undefined
				? {}
				: { biocontrolMethodIds: biocontrolMethodIds.value }),
			...(biocontrolTechnicianProfileIds.value === undefined
				? {}
				: { technicianProfileIds: biocontrolTechnicianProfileIds.value }),
			// Only `true` narrows; `habitatLinked=false` is the same as omitting it.
			...(habitatLinked.value === true ? { habitatLinkedOnly: true } : {}),
			...(regionIds.value === undefined ? {} : { regionIds: regionIds.value }),
			...(dateFrom.value === undefined ? {} : { dateFrom: dateFrom.value }),
			...(dateTo.value === undefined ? {} : { dateTo: dateTo.value }),
		},
	};
}

export function parseBiocontrolPageQuery(
	searchParams: URLSearchParams,
	organizationId: string,
): BiocontrolPageQueryResult {
	const limit = parseLimitParam(searchParams.get('limit'));
	if (!limit.ok) {
		return limit;
	}

	const offset = parseOffsetParam(searchParams.get('offset'));
	if (!offset.ok) {
		return offset;
	}

	const filterParams = new URLSearchParams(searchParams);
	filterParams.delete('limit');
	filterParams.delete('offset');

	const filterResult = parseBiocontrolMapFilters(filterParams);
	if (!filterResult.ok) {
		return filterResult;
	}

	return {
		ok: true,
		input: {
			organizationId,
			filters: filterResult.filters,
			limit: limit.value,
			offset: offset.value,
		},
	};
}

type OutreachFilterResult =
	| { readonly ok: true; readonly filters: OutreachMapFilters }
	| { readonly ok: false; readonly reason: string };

type OutreachPageQueryResult =
	| { readonly ok: true; readonly input: OutreachPageInput }
	| { readonly ok: false; readonly reason: string };

const outreachFilterParams = new Set([
	'outreachMethodId',
	'technician',
	'dateFrom',
	'dateTo',
	regionFilterParam,
]);

export function parseOutreachMapFilters(searchParams: URLSearchParams): OutreachFilterResult {
	const unknownParams = [...searchParams.keys()].filter(
		(param) => !outreachFilterParams.has(param),
	);
	if (unknownParams.length > 0) {
		return { ok: false, reason: `Unsupported outreach filter: ${unknownParams[0]}.` };
	}

	const outreachMethodIds = parseOptionalUuidListFilter(searchParams, 'outreachMethodId');
	if (!outreachMethodIds.ok) {
		return outreachMethodIds;
	}

	const technicianProfileIds = parseOptionalUuidListFilter(searchParams, 'technician');
	if (!technicianProfileIds.ok) {
		return technicianProfileIds;
	}

	const regionIds = parseOptionalUuidListFilter(searchParams, regionFilterParam);
	if (!regionIds.ok) {
		return regionIds;
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
			...(outreachMethodIds.value === undefined
				? {}
				: { outreachMethodIds: outreachMethodIds.value }),
			...(technicianProfileIds.value === undefined
				? {}
				: { technicianProfileIds: technicianProfileIds.value }),
			...(regionIds.value === undefined ? {} : { regionIds: regionIds.value }),
			...(dateFrom.value === undefined ? {} : { dateFrom: dateFrom.value }),
			...(dateTo.value === undefined ? {} : { dateTo: dateTo.value }),
		},
	};
}

export function parseOutreachPageQuery(
	searchParams: URLSearchParams,
	organizationId: string,
): OutreachPageQueryResult {
	const limit = parseLimitParam(searchParams.get('limit'));
	if (!limit.ok) {
		return limit;
	}

	const offset = parseOffsetParam(searchParams.get('offset'));
	if (!offset.ok) {
		return offset;
	}

	const filterParams = new URLSearchParams(searchParams);
	filterParams.delete('limit');
	filterParams.delete('offset');

	const filterResult = parseOutreachMapFilters(filterParams);
	if (!filterResult.ok) {
		return filterResult;
	}

	return {
		ok: true,
		input: {
			organizationId,
			filters: filterResult.filters,
			limit: limit.value,
			offset: offset.value,
		},
	};
}

type TrapFilterResult =
	| { readonly ok: true; readonly filters: TrapMapFilters }
	| { readonly ok: false; readonly reason: string };

type TrapPageQueryResult =
	| { readonly ok: true; readonly input: TrapPageInput }
	| { readonly ok: false; readonly reason: string };

const trapFilterParams = new Set(['collectionMethodId', 'status', 'search', regionFilterParam]);

export function parseTrapMapFilters(searchParams: URLSearchParams): TrapFilterResult {
	const unknownParams = [...searchParams.keys()].filter((param) => !trapFilterParams.has(param));
	if (unknownParams.length > 0) {
		return { ok: false, reason: `Unsupported traps filter: ${unknownParams[0]}.` };
	}

	const collectionMethodIds = parseOptionalUuidListFilter(searchParams, 'collectionMethodId');
	if (!collectionMethodIds.ok) {
		return collectionMethodIds;
	}

	const isActive = parseOptionalTrapStatusFilter(searchParams, 'status');
	if (!isActive.ok) {
		return isActive;
	}

	const search = parseOptionalTextFilter(searchParams, 'search');
	if (!search.ok) {
		return search;
	}

	const regionIds = parseOptionalUuidListFilter(searchParams, regionFilterParam);
	if (!regionIds.ok) {
		return regionIds;
	}

	return {
		ok: true,
		filters: {
			...(collectionMethodIds.value === undefined
				? {}
				: { collectionMethodIds: collectionMethodIds.value }),
			...(isActive.value === undefined ? {} : { isActive: isActive.value }),
			...(search.value === undefined ? {} : { search: search.value }),
			...(regionIds.value === undefined ? {} : { regionIds: regionIds.value }),
		},
	};
}

export function parseTrapPageQuery(
	searchParams: URLSearchParams,
	organizationId: string,
): TrapPageQueryResult {
	const limit = parseLimitParam(searchParams.get('limit'));
	if (!limit.ok) {
		return limit;
	}

	const offset = parseOffsetParam(searchParams.get('offset'));
	if (!offset.ok) {
		return offset;
	}

	const filterParams = new URLSearchParams(searchParams);
	filterParams.delete('limit');
	filterParams.delete('offset');

	const filterResult = parseTrapMapFilters(filterParams);
	if (!filterResult.ok) {
		return filterResult;
	}

	return {
		ok: true,
		input: {
			organizationId,
			filters: filterResult.filters,
			limit: limit.value,
			offset: offset.value,
		},
	};
}

function parseOptionalTrapStatusFilter(
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

	const trimmed = values[0]?.trim().toLowerCase() ?? '';
	if (trimmed.length === 0) {
		return { ok: true, value: undefined };
	}
	if (trimmed === 'active') {
		return { ok: true, value: true };
	}
	if (trimmed === 'inactive') {
		return { ok: true, value: false };
	}

	return { ok: false, reason: `${param} must be active or inactive.` };
}

type CollectionFilterResult =
	| { readonly ok: true; readonly filters: CollectionMapFilters }
	| { readonly ok: false; readonly reason: string };

type CollectionPageQueryResult =
	| { readonly ok: true; readonly input: CollectionPageInput }
	| { readonly ok: false; readonly reason: string };

const collectionFilterParams = new Set([
	'collectionMethodId',
	'problem',
	'dateFrom',
	'dateTo',
	regionFilterParam,
]);

export function parseCollectionMapFilters(searchParams: URLSearchParams): CollectionFilterResult {
	const unknownParams = [...searchParams.keys()].filter(
		(param) => !collectionFilterParams.has(param),
	);
	if (unknownParams.length > 0) {
		return { ok: false, reason: `Unsupported collections filter: ${unknownParams[0]}.` };
	}

	const collectionMethodIds = parseOptionalUuidListFilter(searchParams, 'collectionMethodId');
	if (!collectionMethodIds.ok) {
		return collectionMethodIds;
	}

	const problem = parseOptionalBooleanFilter(searchParams, 'problem');
	if (!problem.ok) {
		return problem;
	}

	const regionIds = parseOptionalUuidListFilter(searchParams, regionFilterParam);
	if (!regionIds.ok) {
		return regionIds;
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
			...(collectionMethodIds.value === undefined
				? {}
				: { collectionMethodIds: collectionMethodIds.value }),
			// Only `true` narrows; `problem=false` is the same as omitting it.
			...(problem.value === true ? { problemOnly: true } : {}),
			...(regionIds.value === undefined ? {} : { regionIds: regionIds.value }),
			...(dateFrom.value === undefined ? {} : { dateFrom: dateFrom.value }),
			...(dateTo.value === undefined ? {} : { dateTo: dateTo.value }),
		},
	};
}

export function parseCollectionPageQuery(
	searchParams: URLSearchParams,
	organizationId: string,
): CollectionPageQueryResult {
	const limit = parseLimitParam(searchParams.get('limit'));
	if (!limit.ok) {
		return limit;
	}

	const offset = parseOffsetParam(searchParams.get('offset'));
	if (!offset.ok) {
		return offset;
	}

	const filterParams = new URLSearchParams(searchParams);
	filterParams.delete('limit');
	filterParams.delete('offset');

	const filterResult = parseCollectionMapFilters(filterParams);
	if (!filterResult.ok) {
		return filterResult;
	}

	return {
		ok: true,
		input: {
			organizationId,
			filters: filterResult.filters,
			limit: limit.value,
			offset: offset.value,
		},
	};
}

function parseOptionalSampleStatusFilter(
	searchParams: URLSearchParams,
	param: string,
):
	| { readonly ok: true; readonly value: SampleStatus | undefined }
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
	if (!sampleStatusSet.has(trimmed)) {
		return { ok: false, reason: `${param} must be one of: ${sampleStatusValues.join(', ')}.` };
	}

	return { ok: true, value: trimmed as SampleStatus };
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
	regionFilterParam,
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

const maxDisplayOffset = 100_000;

function parseOffsetParam(
	value: string | null,
): { readonly ok: true; readonly value: number } | { readonly ok: false; readonly reason: string } {
	if (value === null || value.trim() === '') {
		return { ok: true, value: 0 };
	}

	const parsed = parseInteger(value);
	if (parsed === null || parsed > maxDisplayOffset) {
		return { ok: false, reason: `offset must be between 0 and ${maxDisplayOffset}.` };
	}

	return { ok: true, value: parsed };
}

function isValidLng(value: number): boolean {
	return Number.isFinite(value) && value >= -180 && value <= 180;
}

function isValidLat(value: number): boolean {
	return Number.isFinite(value) && value >= -90 && value <= 90;
}
