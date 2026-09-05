import {
	DummyDriver,
	Kysely,
	PostgresAdapter,
	PostgresIntrospector,
	PostgresQueryCompiler,
} from 'kysely';
import { describe, expect, it } from 'vitest';
import {
	getCollectionDisplayRowById,
	getCollectionMapExtent,
	getCollectionMvtTile,
	getTrapDisplayRowById,
	getTrapMapExtent,
	getTrapMvtTile,
	listCollectionDisplayRowsPage,
	listTrapDisplayRowsPage,
} from '../../../domains/adult-surveillance.js';
import {
	getApplicationDisplayRowById,
	getApplicationMapExtent,
	getApplicationMvtTile,
	getBiocontrolDisplayRowById,
	getBiocontrolMapExtent,
	getBiocontrolMvtTile,
	getOutreachDisplayRowById,
	getOutreachMapExtent,
	getOutreachMvtTile,
	getRequestedControlActionDisplayRowById,
	getSourceReductionDisplayRowById,
	getSourceReductionMapExtent,
	getSourceReductionMvtTile,
	listApplicationDisplayRowsPage,
	listBiocontrolDisplayRowsPage,
	listOutreachDisplayRowsPage,
	listSourceReductionDisplayRowsPage,
} from '../../../domains/control-operations-map.js';
import {
	getAddressMapExtent,
	getAddressMvtTile,
	getRegionMapExtent,
	getRegionMvtTile,
} from '../../../domains/foundation-geography.js';
import {
	getHabitatDisplayRowById,
	getHabitatMapExtent,
	getHabitatMvtTile,
	listHabitatDisplayRowsByBounds,
} from '../../../domains/habitats.js';
import {
	getInspectionDisplayRowById,
	getInspectionMapExtent,
	getInspectionMvtTile,
	getSampleDisplayRowById,
	getSampleMapExtent,
	getSampleMvtTile,
	listInspectionDisplayRowsByBounds,
	listSampleDisplayRowsByBounds,
} from '../../../domains/larval-surveillance.js';
import type { SimmerDatabase } from '../../../index.js';

// --- the SQL every map surface emits ----------------------------------------
//
// Eleven explorer surfaces each answer the same four questions — the tile, the
// framed extent, the paged list, the single row — and each answers them with
// hand-written SQL. What has to hold across all of them is invisible in any one
// reader: the tenancy predicate, the soft-delete predicate, and (for the
// spatial reads) the envelope pair. ADR 0008 says a read that drops one of
// those leaks another organization's records or resurrects deleted ones, and
// nothing but the eye currently enforces it.
//
// So this compiles every reader against a driver that never connects, and pins
// the result. The per-clause assertions below say what must be true; the file
// snapshot says nothing else moved. Together they let the readers be rewritten —
// a refactor that changes one character of emitted SQL fails here first.

const organizationId = '9a3d9e12-2a1c-4d5f-8f2b-6d0f47a03c31';
// The organization's zone. Named rather than defaulted so a collection read
// that stopped converting `collected_at` would change the SQL these assert on.
const timeZone = 'America/New_York';
const id = 'd4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f70';
const regionIds = ['b7c0c1d4-8f43-4f6a-9d21-5f9a7b2e14aa'];
const ids = ['c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f'];
const bounds = { west: -122.5, south: 37.7, east: -122.3, north: 37.9 };
const tile = { z: 12, x: 655, y: 1583 };
const page = { limit: 50, offset: 100 };
const dates = { dateFrom: '2026-01-01', dateTo: '2026-06-30' };

/**
 * Every map read, each with **every** filter its surface accepts set — an
 * omitted filter emits no predicate, so a reader is only fully pinned when all
 * of them are on.
 */
const mapReads: ReadonlyArray<{
	readonly name: string;
	/** The alias tenancy + soft delete are written against. */
	readonly tenancyAlias: string;
	/** The alias of the geometry the read projects and tests spatially. */
	readonly geomAlias: string;
	/** Whether this read narrows to a `bounds` envelope. */
	readonly spatial: boolean;
	readonly read: (db: Kysely<SimmerDatabase>) => Promise<unknown>;
}> = [
	// --- habitats ---
	{
		name: 'habitat tile',
		tenancyAlias: 'h',
		geomAlias: 'h',
		spatial: true,
		read: (db) =>
			getHabitatMvtTile(db, {
				...tile,
				organizationId,
				filters: {
					isActive: true,
					isInaccessible: false,
					habitatTypeIds: ids,
					tagIds: ids,
					regionIds,
					search: 'ditch',
				},
			}),
	},
	{
		name: 'habitat bbox list',
		tenancyAlias: 'h',
		geomAlias: 'h',
		spatial: true,
		read: (db) =>
			listHabitatDisplayRowsByBounds(db, {
				organizationId,
				bounds,
				...page,
				filters: { isActive: true, habitatTypeIds: ids, tagIds: ids, regionIds, search: 'ditch' },
			}),
	},
	{
		name: 'habitat extent',
		tenancyAlias: 'h',
		geomAlias: 'h',
		spatial: false,
		read: (db) =>
			getHabitatMapExtent(db, {
				organizationId,
				filters: { isActive: true, habitatTypeIds: ids, tagIds: ids, regionIds, search: 'ditch' },
			}),
	},
	{
		name: 'habitat by id',
		tenancyAlias: 'h',
		geomAlias: 'h',
		spatial: false,
		read: (db) => getHabitatDisplayRowById(db, { organizationId, id }),
	},

	// --- inspections ---
	{
		name: 'inspection tile',
		tenancyAlias: 'i',
		geomAlias: 'i',
		spatial: true,
		read: (db) =>
			getInspectionMvtTile(db, {
				...tile,
				organizationId,
				filters: {
					isWet: true,
					densities: ['light', 'heavy'],
					positiveOnly: true,
					habitatTypeIds: ids,
					inspectedByProfileIds: ids,
					regionIds,
					...dates,
				},
			}),
	},
	{
		name: 'inspection bbox list',
		tenancyAlias: 'i',
		geomAlias: 'i',
		spatial: true,
		read: (db) =>
			listInspectionDisplayRowsByBounds(db, {
				organizationId,
				bounds,
				...page,
				filters: {
					isWet: true,
					densities: ['light'],
					positiveOnly: true,
					habitatTypeIds: ids,
					inspectedByProfileIds: ids,
					regionIds,
					...dates,
				},
			}),
	},
	{
		name: 'inspection extent',
		tenancyAlias: 'i',
		geomAlias: 'i',
		spatial: false,
		read: (db) =>
			getInspectionMapExtent(db, {
				organizationId,
				filters: {
					isWet: true,
					densities: ['light'],
					positiveOnly: true,
					habitatTypeIds: ids,
					inspectedByProfileIds: ids,
					regionIds,
					...dates,
				},
			}),
	},
	{
		name: 'inspection by id',
		tenancyAlias: 'i',
		geomAlias: 'i',
		spatial: false,
		read: (db) => getInspectionDisplayRowById(db, { organizationId, id }),
	},

	// --- samples (tenancy on the sample, geometry on its parent inspection) ---
	{
		name: 'sample tile',
		tenancyAlias: 's',
		geomAlias: 'i',
		spatial: true,
		read: (db) =>
			getSampleMvtTile(db, {
				...tile,
				organizationId,
				filters: {
					speciesIds: ids,
					status: 'identified',
					nonMosquitoOnly: true,
					regionIds,
					...dates,
				},
			}),
	},
	{
		name: 'sample bbox list',
		tenancyAlias: 's',
		geomAlias: 'i',
		spatial: true,
		read: (db) =>
			listSampleDisplayRowsByBounds(db, {
				organizationId,
				bounds,
				...page,
				filters: {
					speciesIds: ids,
					status: 'awaiting',
					nonMosquitoOnly: true,
					regionIds,
					...dates,
				},
			}),
	},
	{
		name: 'sample extent',
		tenancyAlias: 's',
		geomAlias: 'i',
		spatial: false,
		read: (db) =>
			getSampleMapExtent(db, {
				organizationId,
				filters: {
					speciesIds: ids,
					status: 'zero_larvae',
					nonMosquitoOnly: true,
					regionIds,
					...dates,
				},
			}),
	},
	{
		name: 'sample by id',
		tenancyAlias: 's',
		geomAlias: 'i',
		spatial: false,
		read: (db) => getSampleDisplayRowById(db, { organizationId, id }),
	},

	// --- traps ---
	{
		name: 'trap tile',
		tenancyAlias: 't',
		geomAlias: 't',
		spatial: true,
		read: (db) =>
			getTrapMvtTile(db, {
				...tile,
				organizationId,
				filters: { collectionMethodIds: ids, isActive: true, search: 'gravid', regionIds },
			}),
	},
	{
		name: 'trap page',
		tenancyAlias: 't',
		geomAlias: 't',
		spatial: false,
		read: (db) =>
			listTrapDisplayRowsPage(db, {
				organizationId,
				...page,
				filters: { collectionMethodIds: ids, isActive: true, search: 'gravid', regionIds },
			}),
	},
	{
		name: 'trap extent',
		tenancyAlias: 't',
		geomAlias: 't',
		spatial: false,
		read: (db) =>
			getTrapMapExtent(db, {
				organizationId,
				filters: { collectionMethodIds: ids, isActive: true, search: 'gravid', regionIds },
			}),
	},
	{
		name: 'trap by id',
		tenancyAlias: 't',
		geomAlias: 't',
		spatial: false,
		read: (db) => getTrapDisplayRowById(db, { organizationId, id }),
	},

	// --- collections ---
	{
		name: 'collection tile',
		tenancyAlias: 'c',
		geomAlias: 'c',
		spatial: true,
		read: (db) =>
			getCollectionMvtTile(db, {
				...tile,
				organizationId,
				timeZone,
				filters: { collectionMethodIds: ids, problemOnly: true, regionIds, ...dates },
			}),
	},
	{
		name: 'collection page',
		tenancyAlias: 'c',
		geomAlias: 'c',
		spatial: false,
		read: (db) =>
			listCollectionDisplayRowsPage(db, {
				organizationId,
				timeZone,
				...page,
				filters: { collectionMethodIds: ids, problemOnly: true, regionIds, ...dates },
			}),
	},
	{
		name: 'collection extent',
		tenancyAlias: 'c',
		geomAlias: 'c',
		spatial: false,
		read: (db) =>
			getCollectionMapExtent(db, {
				organizationId,
				timeZone,
				filters: { collectionMethodIds: ids, problemOnly: true, regionIds, ...dates },
			}),
	},
	{
		name: 'collection by id',
		tenancyAlias: 'c',
		geomAlias: 'c',
		spatial: false,
		read: (db) => getCollectionDisplayRowById(db, { organizationId, id }),
	},

	// --- chemical applications ---
	{
		name: 'application tile',
		tenancyAlias: 'a',
		geomAlias: 'a',
		spatial: true,
		read: (db) =>
			getApplicationMvtTile(db, {
				...tile,
				organizationId,
				filters: {
					insecticideIds: ids,
					applicationMethodIds: ids,
					applicatorProfileIds: ids,
					regionIds,
					...dates,
				},
			}),
	},
	{
		name: 'application page',
		tenancyAlias: 'a',
		geomAlias: 'a',
		spatial: false,
		read: (db) =>
			listApplicationDisplayRowsPage(db, {
				organizationId,
				...page,
				filters: {
					insecticideIds: ids,
					applicationMethodIds: ids,
					applicatorProfileIds: ids,
					regionIds,
					...dates,
				},
			}),
	},
	{
		name: 'application extent',
		tenancyAlias: 'a',
		geomAlias: 'a',
		spatial: false,
		read: (db) =>
			getApplicationMapExtent(db, {
				organizationId,
				filters: {
					insecticideIds: ids,
					applicationMethodIds: ids,
					applicatorProfileIds: ids,
					regionIds,
					...dates,
				},
			}),
	},
	{
		name: 'application by id',
		tenancyAlias: 'a',
		geomAlias: 'a',
		spatial: false,
		read: (db) => getApplicationDisplayRowById(db, { organizationId, id }),
	},

	// --- source reduction ---
	{
		name: 'source reduction tile',
		tenancyAlias: 'sr',
		geomAlias: 'sr',
		spatial: true,
		read: (db) =>
			getSourceReductionMvtTile(db, {
				...tile,
				organizationId,
				filters: {
					sourceReductionMethodIds: ids,
					technicianProfileIds: ids,
					regionIds,
					...dates,
				},
			}),
	},
	{
		name: 'source reduction page',
		tenancyAlias: 'sr',
		geomAlias: 'sr',
		spatial: false,
		read: (db) =>
			listSourceReductionDisplayRowsPage(db, {
				organizationId,
				...page,
				filters: {
					sourceReductionMethodIds: ids,
					technicianProfileIds: ids,
					regionIds,
					...dates,
				},
			}),
	},
	{
		name: 'source reduction extent',
		tenancyAlias: 'sr',
		geomAlias: 'sr',
		spatial: false,
		read: (db) =>
			getSourceReductionMapExtent(db, {
				organizationId,
				filters: {
					sourceReductionMethodIds: ids,
					technicianProfileIds: ids,
					regionIds,
					...dates,
				},
			}),
	},
	{
		name: 'source reduction by id',
		tenancyAlias: 'sr',
		geomAlias: 'sr',
		spatial: false,
		read: (db) => getSourceReductionDisplayRowById(db, { organizationId, id }),
	},

	// --- biocontrol ---
	{
		name: 'biocontrol tile',
		tenancyAlias: 'ba',
		geomAlias: 'ba',
		spatial: true,
		read: (db) =>
			getBiocontrolMvtTile(db, {
				...tile,
				organizationId,
				filters: {
					biocontrolMethodIds: ids,
					technicianProfileIds: ids,
					habitatLinkedOnly: true,
					regionIds,
					...dates,
				},
			}),
	},
	{
		name: 'biocontrol page',
		tenancyAlias: 'ba',
		geomAlias: 'ba',
		spatial: false,
		read: (db) =>
			listBiocontrolDisplayRowsPage(db, {
				organizationId,
				...page,
				filters: {
					biocontrolMethodIds: ids,
					technicianProfileIds: ids,
					habitatLinkedOnly: true,
					regionIds,
					...dates,
				},
			}),
	},
	{
		name: 'biocontrol extent',
		tenancyAlias: 'ba',
		geomAlias: 'ba',
		spatial: false,
		read: (db) =>
			getBiocontrolMapExtent(db, {
				organizationId,
				filters: {
					biocontrolMethodIds: ids,
					technicianProfileIds: ids,
					habitatLinkedOnly: true,
					regionIds,
					...dates,
				},
			}),
	},
	{
		name: 'biocontrol by id',
		tenancyAlias: 'ba',
		geomAlias: 'ba',
		spatial: false,
		read: (db) => getBiocontrolDisplayRowById(db, { organizationId, id }),
	},

	// --- outreach ---
	{
		name: 'outreach tile',
		tenancyAlias: 'oa',
		geomAlias: 'oa',
		spatial: true,
		read: (db) =>
			getOutreachMvtTile(db, {
				...tile,
				organizationId,
				filters: { outreachMethodIds: ids, technicianProfileIds: ids, regionIds, ...dates },
			}),
	},
	{
		name: 'outreach page',
		tenancyAlias: 'oa',
		geomAlias: 'oa',
		spatial: false,
		read: (db) =>
			listOutreachDisplayRowsPage(db, {
				organizationId,
				...page,
				filters: { outreachMethodIds: ids, technicianProfileIds: ids, regionIds, ...dates },
			}),
	},
	{
		name: 'outreach extent',
		tenancyAlias: 'oa',
		geomAlias: 'oa',
		spatial: false,
		read: (db) =>
			getOutreachMapExtent(db, {
				organizationId,
				filters: { outreachMethodIds: ids, technicianProfileIds: ids, regionIds, ...dates },
			}),
	},
	{
		name: 'outreach by id',
		tenancyAlias: 'oa',
		geomAlias: 'oa',
		spatial: false,
		read: (db) => getOutreachDisplayRowById(db, { organizationId, id }),
	},

	// --- requested control actions (by-id geometry only; no explorer of its own) ---
	{
		name: 'requested control action by id',
		tenancyAlias: 'rca',
		geomAlias: 'rca',
		spatial: false,
		read: (db) => getRequestedControlActionDisplayRowById(db, { organizationId, id }),
	},

	// --- addresses ---
	{
		name: 'address tile',
		tenancyAlias: 'a',
		geomAlias: 'a',
		spatial: true,
		read: (db) =>
			getAddressMvtTile(db, {
				...tile,
				organizationId,
				filters: { search: 'main st', regionIds },
			}),
	},
	{
		name: 'address extent',
		tenancyAlias: 'a',
		geomAlias: 'a',
		spatial: false,
		read: (db) =>
			getAddressMapExtent(db, { organizationId, filters: { search: 'main st', regionIds } }),
	},

	// --- regions ---
	{
		name: 'region tile',
		tenancyAlias: 'r',
		geomAlias: 'r',
		spatial: true,
		read: (db) =>
			getRegionMvtTile(db, {
				...tile,
				organizationId,
				filters: { regionFolderId: 'unfiled', search: 'north', ids },
			}),
	},
	{
		name: 'region extent',
		tenancyAlias: 'r',
		geomAlias: 'r',
		spatial: false,
		read: (db) =>
			getRegionMapExtent(db, {
				organizationId,
				filters: { regionFolderId: 'unfiled', search: 'north', ids },
			}),
	},
];

describe('map surface scope', () => {
	it.each(
		mapReads.map((read) => [read.name, read] as const),
	)('the %s read is scoped to one organization and excludes deleted rows', async (_name, mapRead) => {
		const { db, queries } = compilingDatabase();

		await mapRead.read(db);

		expect(queries).toHaveLength(1);
		const compiled = normalize(queries[0]?.sql ?? '');
		// The tenancy id is bound, never inlined, on every surface.
		expect(queries[0]?.parameters).toContain(organizationId);
		expect(compiled).toContain(`${mapRead.tenancyAlias}.organization_id = $`);
		expect(compiled).toContain(`${mapRead.tenancyAlias}.deleted_at is null`);
	});

	it.each(
		mapReads.filter((read) => read.spatial).map((read) => [read.name, read] as const),
	)('the %s read narrows to the tile envelope, index-friendly test first', async (_name, mapRead) => {
		const { db, queries } = compilingDatabase();

		await mapRead.read(db);

		const compiled = normalize(queries[0]?.sql ?? '');
		const overlap = compiled.indexOf(`${mapRead.geomAlias}.geom && bounds.geom_4326`);
		const intersects = compiled.indexOf(
			`st_intersects(${mapRead.geomAlias}.geom, bounds.geom_4326)`,
		);
		expect(overlap).toBeGreaterThan(-1);
		// `&&` before `st_intersects` so the GiST index narrows before the exact
		// test runs on what is left.
		expect(intersects).toBeGreaterThan(overlap);
	});

	it.each(
		mapReads.filter((read) => !read.spatial).map((read) => [read.name, read] as const),
	)('the %s read is not viewport-bounded', async (_name, mapRead) => {
		const { db, queries } = compilingDatabase();

		await mapRead.read(db);

		// An extent, page, or by-id read that picked up an envelope predicate
		// would silently answer for the last viewport instead of the filter.
		expect(normalize(queries[0]?.sql ?? '')).not.toContain('bounds.geom_4326');
	});

	it('emits the same SQL for every map read', async () => {
		const { db, queries } = compilingDatabase();

		for (const mapRead of mapReads) {
			await mapRead.read(db);
		}

		const dump = mapReads
			.map((mapRead, index) => `-- ${mapRead.name}\n${normalize(queries[index]?.sql ?? '')}`)
			.join('\n\n');

		await expect(dump).toMatchFileSnapshot('./__snapshots__/map-surface-sql.snap.sql');
	});
});

interface CompiledQuery {
	readonly sql: string;
	readonly parameters: readonly unknown[];
}

/** A Kysely that compiles queries and records them instead of connecting. */
function compilingDatabase(): {
	readonly db: Kysely<SimmerDatabase>;
	readonly queries: CompiledQuery[];
} {
	const queries: CompiledQuery[] = [];
	const db = new Kysely<SimmerDatabase>({
		dialect: {
			createAdapter: () => new PostgresAdapter(),
			createDriver: () => new DummyDriver(),
			createIntrospector: (instance) => new PostgresIntrospector(instance),
			createQueryCompiler: () => new PostgresQueryCompiler(),
		},
		log: (event) => {
			queries.push({ sql: event.query.sql, parameters: event.query.parameters });
		},
	});

	return { db, queries };
}

function normalize(sql: string): string {
	return sql.replace(/\s+/g, ' ').trim();
}
