import {
	DummyDriver,
	Kysely,
	PostgresAdapter,
	PostgresIntrospector,
	PostgresQueryCompiler,
} from 'kysely';
import { describe, expect, it } from 'vitest';
import { getCollectionMapExtent } from '../../../domains/adult-surveillance.js';
import { getApplicationMvtTile } from '../../../domains/control-operations-map.js';
import { getHabitatMapExtent } from '../../../domains/habitats.js';
import { getSampleMapExtent } from '../../../domains/larval-surveillance.js';
import type { SimmerDatabase } from '../../../index.js';

// The region filter is a spatial predicate spread across nine map readers, each
// with its own table alias. These compile the SQL — no database — to prove the
// predicate lands on the right geometry and, above all, that the region set is
// scoped to the record's own organization: a filter that skipped that would let
// a guessed region id from another organization widen a tenant-scoped read.

const organizationId = '9a3d9e12-2a1c-4d5f-8f2b-6d0f47a03c31';
// The organization's zone. Named rather than defaulted so a collection read
// that stopped converting `collected_at` would change the SQL these assert on.
const timeZone = 'America/New_York';
const regionIds = ['b7c0c1d4-8f43-4f6a-9d21-5f9a7b2e14aa', 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f'];

describe('region membership filter', () => {
	it.each([
		[
			'habitats',
			async (db: Kysely<SimmerDatabase>) =>
				getHabitatMapExtent(db, { organizationId, filters: { regionIds } }),
			'h',
			'h',
		],
		[
			// A sample has no geometry of its own: it is in a region when its parent
			// inspection is, while tenancy still comes from the sample.
			'samples',
			async (db: Kysely<SimmerDatabase>) =>
				getSampleMapExtent(db, { organizationId, filters: { regionIds } }),
			'i',
			's',
		],
		[
			'collections',
			async (db: Kysely<SimmerDatabase>) =>
				getCollectionMapExtent(db, { organizationId, timeZone, filters: { regionIds } }),
			'c',
			'c',
		],
		[
			'chemical applications',
			async (db: Kysely<SimmerDatabase>) =>
				getApplicationMvtTile(db, { z: 12, x: 1, y: 2, organizationId, filters: { regionIds } }),
			'a',
			'a',
		],
	])('scopes the %s read to regions of the same organization', async (_surface, read, geomAlias, tenancyAlias) => {
		const { db, queries } = compilingDatabase();

		await read(db);

		const sql = normalize(queries[0]?.sql ?? '');
		expect(sql).toContain('from regions rf');
		expect(sql).toContain(`rf.organization_id = ${tenancyAlias}.organization_id`);
		expect(sql).toContain(`st_intersects(rf.geom, ${geomAlias}.geom)`);
		// The bounding-box operator first, so the GiST index can be used before
		// the exact test runs.
		expect(sql).toContain(`rf.geom && ${geomAlias}.geom`);
		expect(sql).toContain('rf.deleted_at is null');
		expect(queries[0]?.parameters).toContain(organizationId);
		expect(queries[0]?.parameters).toContainEqual(regionIds);
	});

	it('leaves the read untouched when no region is selected', async () => {
		const { db, queries } = compilingDatabase();

		await getHabitatMapExtent(db, { organizationId, filters: { isActive: true } });
		await getHabitatMapExtent(db, { organizationId, filters: { regionIds: [] } });

		expect(normalize(queries[0]?.sql ?? '')).not.toContain('regions rf');
		expect(normalize(queries[1]?.sql ?? '')).not.toContain('regions rf');
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
		plugins: [
			{
				transformQuery: (args) => args.node,
				transformResult: async (args) => args.result,
			},
		],
		log: (event) => {
			queries.push({ sql: event.query.sql, parameters: event.query.parameters });
		},
	});

	return { db, queries };
}

function normalize(sql: string): string {
	return sql.replace(/\s+/g, ' ').trim();
}
