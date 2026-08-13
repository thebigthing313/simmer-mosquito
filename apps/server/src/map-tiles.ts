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
	countProfileActivity,
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
	getOrganizationSettingsRaw,
	getOutreachDisplayRowById,
	getOutreachMapExtent,
	getOutreachMvtTile,
	getRegionById,
	getRegionMapExtent,
	getRegionMvtTile,
	getRequestedControlActionDisplayRowById,
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
	listInspectionDisplayRowsByBounds,
	listMissionItemGeometry,
	listOutreachDisplayRowsPage,
	listProfileActivity,
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
import { resolveOrganizationSettings } from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';

// Route site + search readers registered below the literal habitat map routes.
const mvtContentType = 'application/vnd.mapbox-vector-tile';
const maxSupportedZoom = 22;
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The region narrowing every map surface accepts. Regions are the agency's own
 * operational geography, so "only this district" is asked of habitats, traps,
 * applications, and everything else alike — one param name across every tileset
 * keeps a deep link from one explorer readable by the next.
 */
const regionFilterParam = 'regionId';

type TileDb = Kysely<SimmerDatabase>;

/**
 * Every database read these routes make, in one place.
 *
 * This is the seam the tests substitute at: a route handler must be drivable
 * without Postgres, so each reader has to be replaceable. That was previously
 * done with forty-five optional fields on the registration options and
 * forty-two `??` defaults behind them, plus thirty-two function-type aliases to
 * declare the fields with — an interface as complicated as the thing it hid,
 * and a test helper that spent seventy lines threading ten of the forty-five
 * through conditional spreads.
 *
 * One object, one spread. A new route adds a line here and a line at its
 * registration, and it is injectable from the moment it exists — which the old
 * shape did not manage: `getRegionById`, `getAddressById` and
 * `getRequestedControlActionDisplayRowById` were called directly, so three
 * routes could not be driven without a database at all.
 */
const defaultMapReaders = {
	getHabitatTile: getHabitatMvtTile,
	getRegionTile: getRegionMvtTile,
	getAddressTile: getAddressMvtTile,
	getInspectionTile: getInspectionMvtTile,
	getSampleTile: getSampleMvtTile,
	getApplicationTile: getApplicationMvtTile,
	getSourceReductionTile: getSourceReductionMvtTile,
	getBiocontrolTile: getBiocontrolMvtTile,
	getOutreachTile: getOutreachMvtTile,
	getTrapTile: getTrapMvtTile,
	getCollectionTile: getCollectionMvtTile,

	getHabitatExtent: getHabitatMapExtent,
	getRegionExtent: getRegionMapExtent,
	getAddressExtent: getAddressMapExtent,
	getInspectionExtent: getInspectionMapExtent,
	getSampleExtent: getSampleMapExtent,
	getApplicationExtent: getApplicationMapExtent,
	getSourceReductionExtent: getSourceReductionMapExtent,
	getBiocontrolExtent: getBiocontrolMapExtent,
	getOutreachExtent: getOutreachMapExtent,
	getTrapExtent: getTrapMapExtent,
	getCollectionExtent: getCollectionMapExtent,

	listHabitatDisplayRows: listHabitatDisplayRowsByBounds,
	listInspectionDisplayRows: listInspectionDisplayRowsByBounds,
	listSampleDisplayRows: listSampleDisplayRowsByBounds,
	listApplicationDisplayRows: listApplicationDisplayRowsPage,
	listSourceReductionDisplayRows: listSourceReductionDisplayRowsPage,
	listBiocontrolDisplayRows: listBiocontrolDisplayRowsPage,
	listOutreachDisplayRows: listOutreachDisplayRowsPage,
	listTrapDisplayRows: listTrapDisplayRowsPage,
	listCollectionDisplayRows: listCollectionDisplayRowsPage,

	getHabitatDisplayRow: getHabitatDisplayRowById,
	getRegionRow: getRegionById,
	getAddressRow: getAddressById,
	getInspectionDisplayRow: getInspectionDisplayRowById,
	getSampleDisplayRow: getSampleDisplayRowById,
	getApplicationDisplayRow: getApplicationDisplayRowById,
	getSourceReductionDisplayRow: getSourceReductionDisplayRowById,
	getBiocontrolDisplayRow: getBiocontrolDisplayRowById,
	getOutreachDisplayRow: getOutreachDisplayRowById,
	getRequestedControlActionRow: getRequestedControlActionDisplayRowById,
	getTrapDisplayRow: getTrapDisplayRowById,
	getCollectionDisplayRow: getCollectionDisplayRowById,

	searchHabitatDisplayRows: searchHabitatSites,
	countHabitatTypeUsage: countActiveHabitatsByType,
	listMissionItems: listMissionItemGeometry,
	listProfileActivity,
	countProfileActivity,
	getOrganizationSettings: getOrganizationSettingsRaw,
};

type MapReaders = typeof defaultMapReaders;

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

interface MapBounds {
	readonly west: number;
	readonly south: number;
	readonly east: number;
	readonly north: number;
}

/** A paged read that also narrows to the viewport the client is looking at. */
type BboxPageInput<TFilters> = PageInput<TFilters> & { readonly bounds: MapBounds };

// The tileset registry is type-erased at the Map boundary so it can hold tilesets
// with different filter shapes (habitats, inspections). `defineTileSet` keeps each
// entry's parse/getTile pair internally type-safe; only the erasure to `unknown`
// filters crosses the boundary, and the pair is defined together so they can't drift.
interface TileSetDefinition {
	/** The `:tileset` path segment this entry answers to. */
	readonly key: string;
	readonly parseFilters: (searchParams: URLSearchParams) => FilterResult<unknown>;
	readonly getTile: (
		db: TileDb,
		input: TileCoordinate & {
			readonly organizationId: string;
			readonly filters: unknown;
		},
	) => Promise<Uint8Array>;
	readonly getExtent: (
		db: TileDb,
		input: { readonly organizationId: string; readonly filters: unknown },
	) => Promise<MapExtent | null>;
}

function defineTileSet<F>(def: {
	readonly key: string;
	readonly parseFilters: (searchParams: URLSearchParams) => FilterResult<F>;
	readonly getTile: (
		db: TileDb,
		input: TileCoordinate & { readonly organizationId: string; readonly filters: F },
	) => Promise<Uint8Array>;
	readonly getExtent: (
		db: TileDb,
		input: { readonly organizationId: string; readonly filters: F },
	) => Promise<MapExtent | null>;
}): TileSetDefinition {
	return def as unknown as TileSetDefinition;
}

export function registerMapTileRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: TileDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
		/**
		 * Readers to use instead of the real ones. Anything omitted is the real
		 * one, so a test names only what it drives.
		 */
		readonly readers?: Partial<MapReaders>;
	},
): void {
	const readers: MapReaders = { ...defaultMapReaders, ...options.readers };
	const tileSets = createTileSetRegistry(readers);

	registerPagedRoute(app, options, {
		path: '/map/habitats',
		key: 'habitats',
		parseQuery: parseHabitatDisplayQuery,
		list: readers.listHabitatDisplayRows,
	});

	// Registered before `/:id` so the literal segment wins over the UUID param.
	app.get('/map/habitats/type-usage', options.authContextMiddleware, async (context) => {
		const authContext = context.get('authContext');
		const usage = await readers.countHabitatTypeUsage(options.db, {
			organizationId: authContext.organization.id,
		});

		return context.json({ usage });
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
		const habitats = await readers.searchHabitatDisplayRows(options.db, {
			organizationId: authContext.organization.id,
			search: searchResult.search,
			limit: searchResult.limit,
		});

		return context.json({ habitats });
	});

	registerByIdRoute(app, options, {
		path: '/map/habitats/:id',
		key: 'habitat',
		noun: 'Habitat',
		get: readers.getHabitatDisplayRow,
	});

	// Region + address geometry is deliberately excluded from the Electric sync
	// shapes (the on-demand rows carry no geometry), so detail views read the
	// polygon/point over HTTP the same way habitats do.
	registerByIdRoute(app, options, {
		path: '/map/regions/:id',
		key: 'region',
		noun: 'Region',
		get: readers.getRegionRow,
		toResponse: (row) => ({ ...row.geometry }),
	});

	registerByIdRoute(app, options, {
		path: '/map/addresses/:id',
		key: 'address',
		noun: 'Address',
		get: readers.getAddressRow,
		toResponse: (row) => ({ ...row.geometry }),
	});

	registerPagedRoute(app, options, {
		path: '/map/inspections',
		key: 'inspections',
		parseQuery: parseInspectionDisplayQuery,
		list: readers.listInspectionDisplayRows,
	});

	registerByIdRoute(app, options, {
		path: '/map/inspections/:id',
		key: 'inspection',
		noun: 'Inspection',
		get: readers.getInspectionDisplayRow,
	});

	registerPagedRoute(app, options, {
		path: '/map/samples',
		key: 'samples',
		parseQuery: parseSampleDisplayQuery,
		list: readers.listSampleDisplayRows,
	});

	registerByIdRoute(app, options, {
		path: '/map/samples/:id',
		key: 'sample',
		noun: 'Sample',
		get: readers.getSampleDisplayRow,
	});

	registerPagedRoute(app, options, {
		path: '/map/chemical',
		key: 'applications',
		parseQuery: (searchParams, organizationId) =>
			parsePageQuery(searchParams, organizationId, parseApplicationMapFilters),
		list: readers.listApplicationDisplayRows,
	});

	registerByIdRoute(app, options, {
		path: '/map/chemical/:id',
		key: 'application',
		noun: 'Application',
		get: readers.getApplicationDisplayRow,
	});

	registerPagedRoute(app, options, {
		path: '/map/source-reduction',
		key: 'sourceReductions',
		parseQuery: (searchParams, organizationId) =>
			parsePageQuery(searchParams, organizationId, parseSourceReductionMapFilters),
		list: readers.listSourceReductionDisplayRows,
	});

	registerByIdRoute(app, options, {
		path: '/map/source-reduction/:id',
		key: 'sourceReduction',
		noun: 'Source reduction',
		get: readers.getSourceReductionDisplayRow,
	});

	registerPagedRoute(app, options, {
		path: '/map/biocontrol',
		key: 'biocontrolActions',
		parseQuery: (searchParams, organizationId) =>
			parsePageQuery(searchParams, organizationId, parseBiocontrolMapFilters),
		list: readers.listBiocontrolDisplayRows,
	});

	registerByIdRoute(app, options, {
		path: '/map/biocontrol/:id',
		key: 'biocontrolAction',
		noun: 'Biocontrol',
		foundNoun: 'Biocontrol action',
		get: readers.getBiocontrolDisplayRow,
	});

	registerPagedRoute(app, options, {
		path: '/map/outreach',
		key: 'outreachActions',
		parseQuery: (searchParams, organizationId) =>
			parsePageQuery(searchParams, organizationId, parseOutreachMapFilters),
		list: readers.listOutreachDisplayRows,
	});

	registerByIdRoute(app, options, {
		path: '/map/outreach/:id',
		key: 'outreachAction',
		noun: 'Outreach',
		foundNoun: 'Outreach action',
		get: readers.getOutreachDisplayRow,
	});

	// Geometry only — a request's other fields already stream on its Electric
	// shape, and this endpoint exists because the shape carries the centroid
	// rather than the drawn line or area (ADR 0009).
	registerByIdRoute(app, options, {
		path: '/map/requested-control-actions/:id',
		key: 'requestedControlAction',
		noun: 'Requested control action',
		get: readers.getRequestedControlActionRow,
	});

	// Every stop's real shape, in dispatch order. The mission surfaces draw the
	// ditch run and the treated block as they were placed rather than as the
	// centroid the Electric shape carries (ADR 0009), and both draw a whole
	// mission at once — so this is per mission, not per stop.
	app.get('/map/missions/:id/items', options.authContextMiddleware, async (context) => {
		const id = context.req.param('id');
		if (!uuidPattern.test(id)) {
			return context.json({ error: 'invalid_id', reason: 'Mission id must be a UUID.' }, 400);
		}

		const authContext = context.get('authContext');
		const missionItems = await readers.listMissionItems(options.db, {
			missionId: id,
			organizationId: authContext.organization.id,
		});

		return context.json({ missionItems });
	});

	// One Profile's field work over a date range, across the nine record types
	// that attribute work to a person. The five explorers that carry a personnel
	// filter can each answer part of this; none can reach `additional_personnel`,
	// and the collections surface has no personnel filter at all.
	//
	// Tenancy alone, like every other `/map/*` read: agency data is viewable by
	// anyone in the agency, and a floor here would be theatre while those five
	// filters stay open to any member.
	app.get('/map/profiles/:profileId/activity', options.authContextMiddleware, async (context) => {
		const profileId = context.req.param('profileId');
		if (!uuidPattern.test(profileId)) {
			return context.json({ error: 'invalid_id', reason: 'Profile id must be a UUID.' }, 400);
		}

		const queryResult = parseProfileActivityQuery(new URL(context.req.url).searchParams);
		if (!queryResult.ok) {
			return context.json({ error: 'invalid_query', reason: queryResult.reason }, 400);
		}
		const { dateFrom, dateTo } = queryResult;

		const organizationId = context.get('authContext').organization.id;
		// Dates are the agency's, not the database server's: a trap placed at 9pm
		// belongs to the day the crew worked. Everything timestamped is converted
		// into this zone before it is filed under a day.
		const timeZone = resolveOrganizationSettings(
			await readers.getOrganizationSettings(options.db, { organizationId }),
		).settings.timezone;

		const query = { organizationId, profileId, dateFrom, dateTo, timeZone };
		// One extra row is what tells a full result apart from a truncated one. A
		// truncated log that reads as complete is the failure this reports out loud.
		const rows = await readers.listProfileActivity(options.db, {
			...query,
			limit: profileActivityLimit + 1,
		});
		const truncated = rows.length > profileActivityLimit;
		const items = truncated ? rows.slice(0, profileActivityLimit) : rows;
		// Counting costs a second pass over all seventeen branches, so it is paid
		// for only when the cap bit — and then it is worth paying, because "the
		// first 2000 of 4,317" is actionable where a bare flag is not.
		const total = truncated ? await readers.countProfileActivity(options.db, query) : items.length;

		return context.json({ profileId, dateFrom, dateTo, items, total, truncated });
	});

	registerPagedRoute(app, options, {
		path: '/map/traps',
		key: 'traps',
		parseQuery: (searchParams, organizationId) =>
			parsePageQuery(searchParams, organizationId, parseTrapMapFilters),
		list: readers.listTrapDisplayRows,
	});

	registerByIdRoute(app, options, {
		path: '/map/traps/:id',
		key: 'trap',
		noun: 'Trap',
		get: readers.getTrapDisplayRow,
	});

	registerPagedRoute(app, options, {
		path: '/map/collections',
		key: 'collections',
		parseQuery: (searchParams, organizationId) =>
			parsePageQuery(searchParams, organizationId, parseCollectionMapFilters),
		list: readers.listCollectionDisplayRows,
	});

	registerByIdRoute(app, options, {
		path: '/map/collections/:id',
		key: 'collection',
		noun: 'Collection',
		get: readers.getCollectionDisplayRow,
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
				...coordinateResult.coordinate,
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

/**
 * A paged read: parse the query, refuse it or run it, answer rows and a total.
 *
 * Nine copies of this body existed, differing in a path, a response key, a
 * parser and a reader.
 */
function registerPagedRoute<TInput, TRow>(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: TileDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
	route: {
		readonly path: string;
		/** The key the rows come back under, e.g. `biocontrolActions`. */
		readonly key: string;
		readonly parseQuery: (
			searchParams: URLSearchParams,
			organizationId: string,
		) => PageQueryResult<TInput>;
		readonly list: (
			db: TileDb,
			input: TInput,
		) => Promise<{ readonly rows: readonly TRow[]; readonly total: number }>;
	},
): void {
	app.get(route.path, options.authContextMiddleware, async (context) => {
		const authContext = context.get('authContext');
		const queryResult = route.parseQuery(
			new URL(context.req.url).searchParams,
			authContext.organization.id,
		);

		if (!queryResult.ok) {
			return context.json({ error: 'invalid_query', reason: queryResult.reason }, 400);
		}

		const page = await route.list(options.db, queryResult.input);

		return context.json({ [route.key]: page.rows, total: page.total });
	});
}

/**
 * A read of one row by id, tenant-scoped.
 *
 * Thirteen copies, differing in a noun and a reader. The most recently added one
 * was written the same way, which is the argument for this existing: the copy
 * was the path of least resistance.
 *
 * The 404 says "not found" for a row that is not there *and* for one that
 * belongs to another agency — the reader scopes by `organizationId`, so the two
 * are indistinguishable from here, deliberately.
 */
function registerByIdRoute<TRow>(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: TileDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
	route: {
		readonly path: string;
		/** The key the row comes back under. */
		readonly key: string;
		/** The noun in `<noun> id must be a UUID.` */
		readonly noun: string;
		/** The noun in `<noun> not found.`, where it differs from `noun`. */
		readonly foundNoun?: string;
		readonly get: (
			db: TileDb,
			input: { readonly id: string; readonly organizationId: string },
		) => Promise<TRow | undefined>;
		/** For the two routes that answer geometry rather than the row. */
		readonly toResponse?: (row: TRow) => unknown;
	},
): void {
	app.get(route.path, options.authContextMiddleware, async (context) => {
		// Every path registered here carries `:id`, so Hono's `string | undefined`
		// widening cannot happen.
		const id = context.req.param('id') as string;
		if (!uuidPattern.test(id)) {
			return context.json({ error: 'invalid_id', reason: `${route.noun} id must be a UUID.` }, 400);
		}

		const authContext = context.get('authContext');
		const row = await route.get(options.db, { id, organizationId: authContext.organization.id });

		if (row === undefined) {
			return context.json(
				{ error: 'not_found', reason: `${route.foundNoun ?? route.noun} not found.` },
				404,
			);
		}

		return context.json({
			[route.key]: route.toResponse === undefined ? row : route.toResponse(row),
		});
	});
}

/**
 * The eleven tilesets `/map/tiles/:tileset/...` can name.
 *
 * Each is a filter parser and the two readers that must agree with it — the
 * tile the map draws and the extent the camera frames. They are declared
 * together because a tileset that framed one filter set while drawing another
 * would look like a map bug and be a wiring bug.
 */
function createTileSetRegistry(readers: MapReaders): ReadonlyMap<string, TileSetDefinition> {
	const tileSets: readonly TileSetDefinition[] = [
		defineTileSet({
			key: 'habitats',
			parseFilters: parseHabitatTileFilters,
			getTile: readers.getHabitatTile,
			getExtent: readers.getHabitatExtent,
		}),
		defineTileSet({
			key: 'regions',
			parseFilters: parseRegionTileFilters,
			getTile: readers.getRegionTile,
			getExtent: readers.getRegionExtent,
		}),
		defineTileSet({
			key: 'addresses',
			parseFilters: parseAddressTileFilters,
			getTile: readers.getAddressTile,
			getExtent: readers.getAddressExtent,
		}),
		defineTileSet({
			key: 'inspections',
			parseFilters: parseInspectionTileFilters,
			getTile: readers.getInspectionTile,
			getExtent: readers.getInspectionExtent,
		}),
		defineTileSet({
			key: 'samples',
			parseFilters: parseSampleTileFilters,
			getTile: readers.getSampleTile,
			getExtent: readers.getSampleExtent,
		}),
		defineTileSet({
			key: 'chemical',
			parseFilters: parseApplicationMapFilters,
			getTile: readers.getApplicationTile,
			getExtent: readers.getApplicationExtent,
		}),
		defineTileSet({
			key: 'source-reduction',
			parseFilters: parseSourceReductionMapFilters,
			getTile: readers.getSourceReductionTile,
			getExtent: readers.getSourceReductionExtent,
		}),
		defineTileSet({
			key: 'biocontrol',
			parseFilters: parseBiocontrolMapFilters,
			getTile: readers.getBiocontrolTile,
			getExtent: readers.getBiocontrolExtent,
		}),
		defineTileSet({
			key: 'outreach',
			parseFilters: parseOutreachMapFilters,
			getTile: readers.getOutreachTile,
			getExtent: readers.getOutreachExtent,
		}),
		defineTileSet({
			key: 'traps',
			parseFilters: parseTrapMapFilters,
			getTile: readers.getTrapTile,
			getExtent: readers.getTrapExtent,
		}),
		defineTileSet({
			key: 'collections',
			parseFilters: parseCollectionMapFilters,
			getTile: readers.getCollectionTile,
			getExtent: readers.getCollectionExtent,
		}),
	];

	return new Map(tileSets.map((tileSet) => [tileSet.key, tileSet]));
}

/**
 * `limit`, `offset` and the surface's own filters, in that order.
 *
 * Nine copies of this existed, six of them byte-identical but for the name of
 * the filter parser they called and three of them the same plus `bbox`. The
 * `delete` calls are the reason it has to be one function rather than a
 * convention: every filter parser refuses a param it does not recognise, so
 * forgetting to strip `limit` from what it is handed turns a paging request
 * into a 400.
 */
function parsePageQuery<TFilters>(
	searchParams: URLSearchParams,
	organizationId: string,
	parseFilters: (params: URLSearchParams) => FilterResult<TFilters>,
): PageQueryResult<PageInput<TFilters>> {
	const limit = parseLimitParam(searchParams.get('limit'));
	if (!limit.ok) {
		return limit;
	}

	const offset = parseOffsetParam(searchParams.get('offset'));
	if (!offset.ok) {
		return offset;
	}

	const filterResult = parseFilters(withoutPageParams(searchParams));
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

/** The same, for the surfaces that page within a viewport. */
function parseBboxPageQuery<TFilters>(
	searchParams: URLSearchParams,
	organizationId: string,
	parseFilters: (params: URLSearchParams) => FilterResult<TFilters>,
): PageQueryResult<PageInput<TFilters> & { readonly bounds: MapBounds }> {
	const bbox = parseBoundingBoxParam(searchParams.get('bbox'));
	if (!bbox.ok) {
		return bbox;
	}

	const page = parsePageQuery(searchParams, organizationId, (params) => {
		params.delete('bbox');
		return parseFilters(params);
	});
	if (!page.ok) {
		return page;
	}

	return { ok: true, input: { ...page.input, bounds: bbox.bounds } };
}

function withoutPageParams(searchParams: URLSearchParams): URLSearchParams {
	const filterParams = new URLSearchParams(searchParams);
	filterParams.delete('limit');
	filterParams.delete('offset');
	return filterParams;
}

type FilterResult<TFilters> =
	| { readonly ok: true; readonly filters: TFilters }
	| { readonly ok: false; readonly reason: string };

type PageQueryResult<TInput> =
	| { readonly ok: true; readonly input: TInput }
	| { readonly ok: false; readonly reason: string };

interface PageInput<TFilters> {
	readonly organizationId: string;
	readonly filters: TFilters;
	readonly limit: number;
	readonly offset: number;
}

// ===========================================================================
// Filter parsers
// ===========================================================================

/**
 * How one query param becomes one filter field.
 *
 * Every surface used to write this out twice: a `Set` of admitted params, and a
 * parse body naming the same params again. Two lists that had to agree, with
 * nothing checking that they did — a param in the `Set` but not the body was
 * silently ignored, and one in the body but not the `Set` was a 400 nobody could
 * explain. Here they are the same list.
 *
 * `trueOnly` is its own kind rather than a boolean because three surfaces had
 * written the rule out longhand: `nonMosquito=false` is the same as omitting
 * it, so only `true` reaches the reader.
 */
interface FilterField {
	/** The query param, as the client sends it. */
	readonly param: string;
	/** The filter key the reader expects, when it differs from the param. */
	readonly as?: string;
	readonly kind:
		| 'boolean'
		| 'trueOnly'
		| 'uuidList'
		| 'text'
		| 'date'
		| 'density'
		| 'sampleStatus'
		| 'trapStatus';
}

/** The region filter is spatial, not an FK, and every surface carries it. */
const regionField = { param: regionFilterParam, as: 'regionIds', kind: 'uuidList' } as const;
const dateFields = [
	{ param: 'dateFrom', kind: 'date' },
	{ param: 'dateTo', kind: 'date' },
] as const satisfies readonly FilterField[];

function defineFilters<TFilters>(
	/** The noun in `Unsupported <noun> filter: x.` */
	noun: string,
	fields: readonly FilterField[],
): (searchParams: URLSearchParams) => FilterResult<TFilters> {
	const admitted = new Set(fields.map((field) => field.param));

	return (searchParams) => {
		const unknownParams = [...searchParams.keys()].filter((param) => !admitted.has(param));
		if (unknownParams.length > 0) {
			return { ok: false, reason: `Unsupported ${noun} filter: ${unknownParams[0]}.` };
		}

		const filters: Record<string, unknown> = {};
		for (const field of fields) {
			const parsed = parseFilterField(searchParams, field);
			if (!parsed.ok) {
				return parsed;
			}
			// `trueOnly` has already dropped `false`; every kind leaves an absent
			// param absent rather than sending an explicit `undefined` down.
			if (parsed.value !== undefined) {
				filters[field.as ?? field.param] = parsed.value;
			}
		}

		return { ok: true, filters: filters as TFilters };
	};
}

function parseFilterField(
	searchParams: URLSearchParams,
	field: FilterField,
):
	| { readonly ok: true; readonly value: unknown }
	| { readonly ok: false; readonly reason: string } {
	switch (field.kind) {
		case 'boolean':
			return parseOptionalBooleanFilter(searchParams, field.param);
		case 'trueOnly': {
			const parsed = parseOptionalBooleanFilter(searchParams, field.param);
			return parsed.ok && parsed.value !== true ? { ok: true, value: undefined } : parsed;
		}
		case 'uuidList':
			return parseOptionalUuidListFilter(searchParams, field.param);
		case 'text':
			return parseOptionalTextFilter(searchParams, field.param);
		case 'date':
			return parseOptionalDateFilter(searchParams, field.param);
		case 'density':
			return parseOptionalDensityListFilter(searchParams, field.param);
		case 'sampleStatus':
			return parseOptionalSampleStatusFilter(searchParams, field.param);
		case 'trapStatus':
			return parseOptionalTrapStatusFilter(searchParams, field.param);
		default: {
			const unhandled: never = field.kind;
			throw new Error(`Unhandled map filter kind ${String(unhandled)}.`);
		}
	}
}

export const parseHabitatTileFilters = defineFilters<HabitatMvtTileFilters>('habitat tile', [
	{ param: 'isActive', kind: 'boolean' },
	{ param: 'isInaccessible', kind: 'boolean' },
	{ param: 'habitatTypeId', as: 'habitatTypeIds', kind: 'uuidList' },
	{ param: 'tagId', as: 'tagIds', kind: 'uuidList' },
	regionField,
	{ param: 'search', kind: 'text' },
]);

export const parseAddressTileFilters = defineFilters<AddressMvtTileFilters>('address tile', [
	{ param: 'search', kind: 'text' },
	regionField,
]);

export const parseRegionTileFilters = defineFilters<RegionMvtTileFilters>('region tile', [
	{ param: 'regionFolderId', kind: 'text' },
	{ param: 'search', kind: 'text' },
	// The regions explorer draws one checkbox-picked set rather than every region
	// its other filters allow, so its extent request names the ids outright.
	{ param: 'id', as: 'ids', kind: 'uuidList' },
]);

export const parseInspectionTileFilters = defineFilters<InspectionMvtTileFilters>(
	'inspection tile',
	[
		{ param: 'isWet', kind: 'boolean' },
		{ param: 'density', as: 'densities', kind: 'density' },
		{ param: 'positive', as: 'positiveOnly', kind: 'boolean' },
		{ param: 'habitatTypeId', as: 'habitatTypeIds', kind: 'uuidList' },
		{ param: 'inspectedBy', as: 'inspectedByProfileIds', kind: 'uuidList' },
		regionField,
		...dateFields,
	],
);

export const parseSampleTileFilters = defineFilters<SampleListFilters>('sample tile', [
	{ param: 'species', as: 'speciesIds', kind: 'uuidList' },
	{ param: 'status', kind: 'sampleStatus' },
	{ param: 'nonMosquito', as: 'nonMosquitoOnly', kind: 'trueOnly' },
	regionField,
	...dateFields,
]);

export const parseApplicationMapFilters = defineFilters<ApplicationMapFilters>('chemical', [
	{ param: 'insecticideId', as: 'insecticideIds', kind: 'uuidList' },
	{ param: 'applicationMethodId', as: 'applicationMethodIds', kind: 'uuidList' },
	{ param: 'applicator', as: 'applicatorProfileIds', kind: 'uuidList' },
	regionField,
	...dateFields,
]);

export const parseSourceReductionMapFilters = defineFilters<SourceReductionMapFilters>(
	'source-reduction',
	[
		{ param: 'sourceReductionMethodId', as: 'sourceReductionMethodIds', kind: 'uuidList' },
		{ param: 'technician', as: 'technicianProfileIds', kind: 'uuidList' },
		regionField,
		...dateFields,
	],
);

export const parseBiocontrolMapFilters = defineFilters<BiocontrolMapFilters>('biocontrol', [
	{ param: 'biocontrolMethodId', as: 'biocontrolMethodIds', kind: 'uuidList' },
	{ param: 'habitatLinked', as: 'habitatLinkedOnly', kind: 'trueOnly' },
	{ param: 'technician', as: 'technicianProfileIds', kind: 'uuidList' },
	regionField,
	...dateFields,
]);

export const parseOutreachMapFilters = defineFilters<OutreachMapFilters>('outreach', [
	{ param: 'outreachMethodId', as: 'outreachMethodIds', kind: 'uuidList' },
	{ param: 'technician', as: 'technicianProfileIds', kind: 'uuidList' },
	regionField,
	...dateFields,
]);

export const parseTrapMapFilters = defineFilters<TrapMapFilters>('traps', [
	{ param: 'collectionMethodId', as: 'collectionMethodIds', kind: 'uuidList' },
	{ param: 'status', as: 'isActive', kind: 'trapStatus' },
	{ param: 'search', kind: 'text' },
	regionField,
]);

export const parseCollectionMapFilters = defineFilters<CollectionMapFilters>('collections', [
	{ param: 'collectionMethodId', as: 'collectionMethodIds', kind: 'uuidList' },
	{ param: 'problem', as: 'problemOnly', kind: 'trueOnly' },
	regionField,
	...dateFields,
]);

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

export function parseHabitatDisplayQuery(
	searchParams: URLSearchParams,
	organizationId: string,
): PageQueryResult<BboxPageInput<HabitatMvtTileFilters>> {
	return parseBboxPageQuery(searchParams, organizationId, parseHabitatTileFilters);
}

export function parseInspectionDisplayQuery(
	searchParams: URLSearchParams,
	organizationId: string,
): PageQueryResult<BboxPageInput<InspectionMvtTileFilters>> {
	return parseBboxPageQuery(searchParams, organizationId, parseInspectionTileFilters);
}

const sampleStatusSet = new Set<string>(sampleStatusValues);

function parseSampleDisplayQuery(
	searchParams: URLSearchParams,
	organizationId: string,
): PageQueryResult<BboxPageInput<SampleListFilters>> {
	return parseBboxPageQuery(searchParams, organizationId, parseSampleTileFilters);
}

// --- control-operations map queries -----------------------------------------
//
// These domains render their maps from unbounded MVT tiles, and their list from
// a filtered, offset-paged window (no bbox). Filters fold identically into the
// tile URL and the list query so the map and the paged rail stay in lockstep.

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

/** A finite positive number, absent, or the reason it is neither. */
/**
 * How many activity entries one read may answer with, and how wide a window it
 * may be asked for.
 *
 * The window cap is what actually keeps this read off the row limit; the row
 * limit is the backstop, and the response's `truncated` flag is what lets the
 * client say so when it bites anyway. An over-long range is refused rather than
 * trimmed — a silently narrowed window answers a question nobody asked.
 */
const profileActivityLimit = 2000;
const profileActivityMaxDays = 92;

function parseProfileActivityQuery(
	searchParams: URLSearchParams,
):
	| { readonly ok: true; readonly dateFrom: string; readonly dateTo: string }
	| { readonly ok: false; readonly reason: string } {
	const from = parseOptionalDateFilter(searchParams, 'dateFrom');
	if (!from.ok) {
		return from;
	}
	const to = parseOptionalDateFilter(searchParams, 'dateTo');
	if (!to.ok) {
		return to;
	}
	if (from.value === undefined || to.value === undefined) {
		return { ok: false, reason: 'dateFrom and dateTo are both required.' };
	}
	if (from.value > to.value) {
		return { ok: false, reason: 'dateFrom must not be after dateTo.' };
	}

	const spanDays =
		(Date.parse(`${to.value}T00:00:00Z`) - Date.parse(`${from.value}T00:00:00Z`)) / 86_400_000 + 1;
	if (spanDays > profileActivityMaxDays) {
		return {
			ok: false,
			reason: `The date range may span at most ${profileActivityMaxDays} days.`,
		};
	}

	return { ok: true, dateFrom: from.value, dateTo: to.value };
}

export function parseOptionalPositiveNumber(
	searchParams: URLSearchParams,
	param: string,
):
	| { readonly ok: true; readonly value: number | undefined }
	| { readonly ok: false; readonly reason: string } {
	const raw = searchParams.get(param);
	if (raw === null) {
		return { ok: true, value: undefined };
	}

	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed > 0
		? { ok: true, value: parsed }
		: { ok: false, reason: `${param} must be a positive number.` };
}

export function parseOptionalDateFilter(
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
			readonly bounds: MapBounds;
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
