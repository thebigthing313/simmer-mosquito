import {
	DummyDriver,
	Kysely,
	PostgresAdapter,
	PostgresIntrospector,
	PostgresQueryCompiler,
} from 'kysely';
import { describe, expect, it } from 'vitest';
import { getRequestedControlActionDisplayRowById } from '../../../domains/control-operations-map.js';
import { MAP_SURFACES } from '../../../domains/map-surface-register.js';
import type { SimmerDatabase } from '../../../index.js';

// --- the SQL every map surface emits ----------------------------------------
//
// Eleven explorer surfaces each answer the same four questions — the tile, the
// framed extent, the paged list, the single row — and all forty-one answers come
// out of one factory, reached through the register the surfaces are keyed in.
// What has to hold across all of them is invisible in any one reader: the
// organization predicate, the soft-delete predicate, and (for the spatial reads)
// the envelope pair. ADR 0008 says a read that drops one of those leaks another
// organization's records or resurrects deleted ones, and nothing but the eye
// enforces it.
//
// So this compiles every reader against a driver that never connects, and pins
// the result. The per-clause assertions below say what must be true; the file
// snapshot says nothing else moved. Together they let the readers be rewritten —
// a refactor that changes one character of emitted SQL fails here first.

const organizationId = '9a3d9e12-2a1c-4d5f-8f2b-6d0f47a03c31';
// The organization's zone, which every read carries now that the surfaces share
// one input shape. Deliberately not UTC: a collection read that stopped
// converting `collected_at` would change the SQL these assert on.
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
	/** The alias organization scope + soft delete are written against. */
	readonly organizationAlias: string;
	/** The alias of the geometry the read projects and tests spatially. */
	readonly geomAlias: string;
	/** Whether this read narrows to a `bounds` envelope. */
	readonly spatial: boolean;
	readonly read: (db: Kysely<SimmerDatabase>) => Promise<unknown>;
}> = [
	// --- habitats ---
	{
		name: 'habitat tile',
		organizationAlias: 'h',
		geomAlias: 'h',
		spatial: true,
		read: (db) =>
			MAP_SURFACES.habitats.getTile(db, {
				...tile,
				organizationId,
				timeZone,
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
		organizationAlias: 'h',
		geomAlias: 'h',
		spatial: true,
		read: (db) =>
			MAP_SURFACES.habitats.listByBounds(db, {
				organizationId,
				timeZone,
				bounds,
				...page,
				filters: { isActive: true, habitatTypeIds: ids, tagIds: ids, regionIds, search: 'ditch' },
			}),
	},
	{
		name: 'habitat extent',
		organizationAlias: 'h',
		geomAlias: 'h',
		spatial: false,
		read: (db) =>
			MAP_SURFACES.habitats.getExtent(db, {
				organizationId,
				timeZone,
				filters: { isActive: true, habitatTypeIds: ids, tagIds: ids, regionIds, search: 'ditch' },
			}),
	},
	{
		name: 'habitat by id',
		organizationAlias: 'h',
		geomAlias: 'h',
		spatial: false,
		read: (db) => MAP_SURFACES.habitats.getById(db, { organizationId, timeZone, id }),
	},

	// --- inspections ---
	{
		name: 'inspection tile',
		organizationAlias: 'i',
		geomAlias: 'i',
		spatial: true,
		read: (db) =>
			MAP_SURFACES.inspections.getTile(db, {
				...tile,
				organizationId,
				timeZone,
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
		organizationAlias: 'i',
		geomAlias: 'i',
		spatial: true,
		read: (db) =>
			MAP_SURFACES.inspections.listByBounds(db, {
				organizationId,
				timeZone,
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
		organizationAlias: 'i',
		geomAlias: 'i',
		spatial: false,
		read: (db) =>
			MAP_SURFACES.inspections.getExtent(db, {
				organizationId,
				timeZone,
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
		organizationAlias: 'i',
		geomAlias: 'i',
		spatial: false,
		read: (db) => MAP_SURFACES.inspections.getById(db, { organizationId, timeZone, id }),
	},

	// --- samples (organization on the sample, geometry on its parent inspection) ---
	{
		name: 'sample tile',
		organizationAlias: 's',
		geomAlias: 'i',
		spatial: true,
		read: (db) =>
			MAP_SURFACES.samples.getTile(db, {
				...tile,
				organizationId,
				timeZone,
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
		organizationAlias: 's',
		geomAlias: 'i',
		spatial: true,
		read: (db) =>
			MAP_SURFACES.samples.listByBounds(db, {
				organizationId,
				timeZone,
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
		organizationAlias: 's',
		geomAlias: 'i',
		spatial: false,
		read: (db) =>
			MAP_SURFACES.samples.getExtent(db, {
				organizationId,
				timeZone,
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
		organizationAlias: 's',
		geomAlias: 'i',
		spatial: false,
		read: (db) => MAP_SURFACES.samples.getById(db, { organizationId, timeZone, id }),
	},

	// --- traps ---
	{
		name: 'trap tile',
		organizationAlias: 't',
		geomAlias: 't',
		spatial: true,
		read: (db) =>
			MAP_SURFACES.traps.getTile(db, {
				...tile,
				organizationId,
				timeZone,
				filters: { collectionMethodIds: ids, isActive: true, search: 'gravid', regionIds },
			}),
	},
	{
		name: 'trap page',
		organizationAlias: 't',
		geomAlias: 't',
		spatial: false,
		read: (db) =>
			MAP_SURFACES.traps.listPage(db, {
				organizationId,
				timeZone,
				...page,
				filters: { collectionMethodIds: ids, isActive: true, search: 'gravid', regionIds },
			}),
	},
	{
		name: 'trap extent',
		organizationAlias: 't',
		geomAlias: 't',
		spatial: false,
		read: (db) =>
			MAP_SURFACES.traps.getExtent(db, {
				organizationId,
				timeZone,
				filters: { collectionMethodIds: ids, isActive: true, search: 'gravid', regionIds },
			}),
	},
	{
		name: 'trap by id',
		organizationAlias: 't',
		geomAlias: 't',
		spatial: false,
		read: (db) => MAP_SURFACES.traps.getById(db, { organizationId, timeZone, id }),
	},

	// --- collections ---
	{
		name: 'collection tile',
		organizationAlias: 'c',
		geomAlias: 'c',
		spatial: true,
		read: (db) =>
			MAP_SURFACES.collections.getTile(db, {
				...tile,
				organizationId,
				timeZone,
				filters: { collectionMethodIds: ids, problemOnly: true, regionIds, ...dates },
			}),
	},
	{
		name: 'collection page',
		organizationAlias: 'c',
		geomAlias: 'c',
		spatial: false,
		read: (db) =>
			MAP_SURFACES.collections.listPage(db, {
				organizationId,
				timeZone,
				...page,
				filters: { collectionMethodIds: ids, problemOnly: true, regionIds, ...dates },
			}),
	},
	{
		name: 'collection extent',
		organizationAlias: 'c',
		geomAlias: 'c',
		spatial: false,
		read: (db) =>
			MAP_SURFACES.collections.getExtent(db, {
				organizationId,
				timeZone,
				filters: { collectionMethodIds: ids, problemOnly: true, regionIds, ...dates },
			}),
	},
	{
		name: 'collection by id',
		organizationAlias: 'c',
		geomAlias: 'c',
		spatial: false,
		read: (db) => MAP_SURFACES.collections.getById(db, { organizationId, timeZone, id }),
	},

	// --- chemical applications ---
	{
		name: 'application tile',
		organizationAlias: 'a',
		geomAlias: 'a',
		spatial: true,
		read: (db) =>
			MAP_SURFACES.chemical.getTile(db, {
				...tile,
				organizationId,
				timeZone,
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
		organizationAlias: 'a',
		geomAlias: 'a',
		spatial: false,
		read: (db) =>
			MAP_SURFACES.chemical.listPage(db, {
				organizationId,
				timeZone,
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
		organizationAlias: 'a',
		geomAlias: 'a',
		spatial: false,
		read: (db) =>
			MAP_SURFACES.chemical.getExtent(db, {
				organizationId,
				timeZone,
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
		organizationAlias: 'a',
		geomAlias: 'a',
		spatial: false,
		read: (db) => MAP_SURFACES.chemical.getById(db, { organizationId, timeZone, id }),
	},

	// --- source reduction ---
	{
		name: 'source reduction tile',
		organizationAlias: 'sr',
		geomAlias: 'sr',
		spatial: true,
		read: (db) =>
			MAP_SURFACES['source-reduction'].getTile(db, {
				...tile,
				organizationId,
				timeZone,
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
		organizationAlias: 'sr',
		geomAlias: 'sr',
		spatial: false,
		read: (db) =>
			MAP_SURFACES['source-reduction'].listPage(db, {
				organizationId,
				timeZone,
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
		organizationAlias: 'sr',
		geomAlias: 'sr',
		spatial: false,
		read: (db) =>
			MAP_SURFACES['source-reduction'].getExtent(db, {
				organizationId,
				timeZone,
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
		organizationAlias: 'sr',
		geomAlias: 'sr',
		spatial: false,
		read: (db) => MAP_SURFACES['source-reduction'].getById(db, { organizationId, timeZone, id }),
	},

	// --- biocontrol ---
	{
		name: 'biocontrol tile',
		organizationAlias: 'ba',
		geomAlias: 'ba',
		spatial: true,
		read: (db) =>
			MAP_SURFACES.biocontrol.getTile(db, {
				...tile,
				organizationId,
				timeZone,
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
		organizationAlias: 'ba',
		geomAlias: 'ba',
		spatial: false,
		read: (db) =>
			MAP_SURFACES.biocontrol.listPage(db, {
				organizationId,
				timeZone,
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
		organizationAlias: 'ba',
		geomAlias: 'ba',
		spatial: false,
		read: (db) =>
			MAP_SURFACES.biocontrol.getExtent(db, {
				organizationId,
				timeZone,
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
		organizationAlias: 'ba',
		geomAlias: 'ba',
		spatial: false,
		read: (db) => MAP_SURFACES.biocontrol.getById(db, { organizationId, timeZone, id }),
	},

	// --- outreach ---
	{
		name: 'outreach tile',
		organizationAlias: 'oa',
		geomAlias: 'oa',
		spatial: true,
		read: (db) =>
			MAP_SURFACES.outreach.getTile(db, {
				...tile,
				organizationId,
				timeZone,
				filters: { outreachMethodIds: ids, technicianProfileIds: ids, regionIds, ...dates },
			}),
	},
	{
		name: 'outreach page',
		organizationAlias: 'oa',
		geomAlias: 'oa',
		spatial: false,
		read: (db) =>
			MAP_SURFACES.outreach.listPage(db, {
				organizationId,
				timeZone,
				...page,
				filters: { outreachMethodIds: ids, technicianProfileIds: ids, regionIds, ...dates },
			}),
	},
	{
		name: 'outreach extent',
		organizationAlias: 'oa',
		geomAlias: 'oa',
		spatial: false,
		read: (db) =>
			MAP_SURFACES.outreach.getExtent(db, {
				organizationId,
				timeZone,
				filters: { outreachMethodIds: ids, technicianProfileIds: ids, regionIds, ...dates },
			}),
	},
	{
		name: 'outreach by id',
		organizationAlias: 'oa',
		geomAlias: 'oa',
		spatial: false,
		read: (db) => MAP_SURFACES.outreach.getById(db, { organizationId, timeZone, id }),
	},

	// --- requested control actions (by-id geometry only; no explorer of its own) ---
	{
		name: 'requested control action by id',
		organizationAlias: 'rca',
		geomAlias: 'rca',
		spatial: false,
		read: (db) => getRequestedControlActionDisplayRowById(db, { organizationId, timeZone, id }),
	},

	// --- addresses ---
	{
		name: 'address tile',
		organizationAlias: 'a',
		geomAlias: 'a',
		spatial: true,
		read: (db) =>
			MAP_SURFACES.addresses.getTile(db, {
				...tile,
				organizationId,
				timeZone,
				filters: { search: 'main st', regionIds },
			}),
	},
	{
		name: 'address extent',
		organizationAlias: 'a',
		geomAlias: 'a',
		spatial: false,
		read: (db) =>
			MAP_SURFACES.addresses.getExtent(db, {
				organizationId,
				timeZone,
				filters: { search: 'main st', regionIds },
			}),
	},

	// --- regions ---
	{
		name: 'region tile',
		organizationAlias: 'r',
		geomAlias: 'r',
		spatial: true,
		read: (db) =>
			MAP_SURFACES.regions.getTile(db, {
				...tile,
				organizationId,
				timeZone,
				filters: { regionFolderId: 'unfiled', search: 'north', ids },
			}),
	},
	{
		name: 'region extent',
		organizationAlias: 'r',
		geomAlias: 'r',
		spatial: false,
		read: (db) =>
			MAP_SURFACES.regions.getExtent(db, {
				organizationId,
				timeZone,
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
		// The organization id is bound, never inlined, on every surface.
		expect(queries[0]?.parameters).toContain(organizationId);
		expect(compiled).toContain(`${mapRead.organizationAlias}.organization_id = $`);
		expect(compiled).toContain(`${mapRead.organizationAlias}.deleted_at is null`);
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
