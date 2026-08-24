import { REGION_MEMBERSHIP_RECORD_TYPES } from '@simmer-mosquito/db';
import { readUpMigrations } from '@simmer-mosquito/db/test-support';
import { tableSchemas } from '@simmer-mosquito/sync';
import { describe, expect, it } from 'vitest';

/**
 * The region-membership whitelist, held to the schema rather than to a memory.
 *
 * `REGION_MEMBERSHIP_RECORD_TYPES` is fifteen table names written by hand, and a
 * hand-kept list of tables goes wrong in one direction only: a sixteenth table
 * gains geometry, nobody adds it, and every record in it answers "inside no
 * regions" forever. That reads as data, not as a bug, so nothing surfaces it.
 * `writer-coverage.test.ts` is the precedent for asserting over every table at
 * once.
 *
 * The schema is read two independent ways and both have to agree with the list.
 * The generated row schemas carry `geom_type` for exactly the geom-bearing
 * tables, and the migrations carry the `geom` column definitions. Neither alone
 * is enough: the row schemas know which tables have geometry but not what type
 * it is, and a migration parser that quietly matches nothing would pass on its
 * own. Made to agree, a parser that missed a table fails instead.
 *
 * This lives in `apps/server` because it needs `packages/sync`, which sits above
 * `packages/db` where the list is declared.
 */

/** Tables whose generated row schema carries `geom_type`. */
function geomTablesFromRowSchemas(): ReadonlySet<string> {
	const tables = new Set<string>();
	for (const [table, schema] of Object.entries(tableSchemas)) {
		if (Object.hasOwn(schema.shape, 'geom_type')) {
			tables.add(table);
		}
	}
	return tables;
}

/**
 * The declared type of every `geom` column, from the migrations in order.
 *
 * Reading `create table` blocks alone would miss every one of these: all fifteen
 * geom columns arrived through `alter table ... add column` in
 * `202605270001_owned_geometry_columns.sql`. A later `alter column ... type`
 * overwrites, and a `drop column` removes, so the answer is the last thing the
 * set said rather than the first.
 */
async function geomColumnTypesFromMigrations(): Promise<ReadonlyMap<string, string>> {
	const sql = (await readUpMigrations()).map((migration) => migration.sql).join('\n');
	const types = new Map<string, string>();

	// One pass in file order, because order decides the answer. `spatial_features`
	// is the case that proves it: created with a `geom` and dropped four migrations
	// later, so a parser that collected every `create table` first and every
	// `drop table` after would happen to be right here and would be wrong the day a
	// table is dropped and recreated.
	const statements = new RegExp(
		[
			String.raw`(?<createTable>create\s+table\s+(?:if\s+not\s+exists\s+)?(?<created>[a-z_]+)\s*\((?<body>[\s\S]*?)\n\)\s*;)`,
			String.raw`(?<dropTable>drop\s+table\s+(?:if\s+exists\s+)?(?<dropped>[a-z_]+))`,
			String.raw`(?<addColumn>alter\s+table\s+(?:only\s+)?(?<added>[a-z_]+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?geom\s+geometry\(\s*(?<addedType>\w+)\s*,)`,
			String.raw`(?<alterType>alter\s+table\s+(?:only\s+)?(?<altered>[a-z_]+)\s+alter\s+column\s+geom\s+(?:set\s+data\s+)?type\s+geometry\(\s*(?<alteredType>\w+)\s*,)`,
			String.raw`(?<dropColumn>alter\s+table\s+(?:only\s+)?(?<uncolumned>[a-z_]+)\s+drop\s+column\s+(?:if\s+exists\s+)?geom\b)`,
		].join('|'),
		'gi',
	);

	for (const match of sql.matchAll(statements)) {
		const edit = geomEditOf(match.groups ?? {});
		if (edit === null) {
			continue;
		}
		if (edit.type === null) {
			types.delete(edit.table);
		} else {
			types.set(edit.table, edit.type);
		}
	}

	return types;
}

/** What one matched statement does to a table's `geom`. `null` type means it goes. */
interface GeomEdit {
	readonly table: string;
	readonly type: string | null;
}

function geomEditOf(groups: Partial<Record<string, string>>): GeomEdit | null {
	const lower = (value: string | undefined) => (value ?? '').toLowerCase();

	if (groups.created !== undefined) {
		const column = /^\s*geom\s+geometry\(\s*(\w+)\s*,/im.exec(groups.body ?? '');
		return { table: groups.created, type: column === null ? null : lower(column[1]) };
	}
	if (groups.dropped !== undefined) {
		return { table: groups.dropped, type: null };
	}
	if (groups.added !== undefined) {
		return { table: groups.added, type: lower(groups.addedType) };
	}
	if (groups.altered !== undefined) {
		return { table: groups.altered, type: lower(groups.alteredType) };
	}
	if (groups.uncolumned !== undefined) {
		return { table: groups.uncolumned, type: null };
	}
	return null;
}

describe('region membership whitelist', () => {
	it('names exactly the tables the row schemas say carry geometry', () => {
		expect([...REGION_MEMBERSHIP_RECORD_TYPES].sort()).toEqual(
			[...geomTablesFromRowSchemas()].sort(),
		);
	});

	it('names exactly the tables the migrations give a geom column', async () => {
		const fromMigrations = await geomColumnTypesFromMigrations();

		expect([...REGION_MEMBERSHIP_RECORD_TYPES].sort()).toEqual([...fromMigrations.keys()].sort());
	});

	it('lists every table once', () => {
		expect(new Set(REGION_MEMBERSHIP_RECORD_TYPES).size).toBe(
			REGION_MEMBERSHIP_RECORD_TYPES.length,
		);
	});
});

describe('the client-side membership path', () => {
	/**
	 * `use-region-membership.ts` answers from a `LngLat` and is used by exactly two
	 * pages, `gis/addresses` and `public-engagement/service-requests`. It agrees
	 * with the server only because both tables are point-typed: points keep plain
	 * intersection, and `geometryContainsLngLat` already counts a boundary hit as
	 * inside.
	 *
	 * If either column becomes `geometry(Geometry, 4326)` the way habitats did, the
	 * hook keeps answering from a centroid and silently diverges, and the client
	 * cannot detect it from the `LngLat` it was handed. So the accident is written
	 * down as an assertion.
	 */
	it('rests on addresses and service requests being point-typed', async () => {
		const types = await geomColumnTypesFromMigrations();

		expect(types.get('addresses')).toBe('point');
		expect(types.get('service_requests')).toBe('point');
	});

	it('finds a non-point table too, so the assertion above can fail', async () => {
		// Without this, a parser that answered `point` for everything would pass.
		const types = await geomColumnTypesFromMigrations();

		expect(types.get('habitats')).toBe('geometry');
	});
});
