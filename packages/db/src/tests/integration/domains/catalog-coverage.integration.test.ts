import { expect, it } from 'vitest';
import {
	catalogRecordTypes,
	deletableRecordTable,
	deleteReferenceScopes,
	type Kysely,
	type SimmerDatabase,
	sql,
} from '../../../index.js';
import { describeDbIntegration, withTestDb } from '../../../test-support/db-integration.js';

/**
 * Every foreign key pointing at a catalog has a rule.
 *
 * This exists because of how the catalog rules were first written: from a
 * script that read the migration files for `create table` blocks. A column
 * added later by `alter table` is invisible to that, so
 * `missions.notification_type_id` got no rule and a deleted Notification Type
 * went on orphaning Missions. Nothing caught it, because the registry is a
 * hand-written list and a hand-written list cannot notice what it omits.
 *
 * The schema is the only thing that knows, so this asks it. A catalog that
 * gains a referrer fails here rather than shipping a hole the same shape as the
 * one #123 was filed about.
 *
 * It does not check that a rule is *right*: the effect, the noun, and the plural
 * are judgement. It refuses silence.
 *
 * One test rather than two, and one query rather than one per catalog. Each
 * `withTestDb` builds a throwaway schema and applies every migration into it,
 * which against a remote database is most of the 45s budget on its own.
 */
describeDbIntegration('catalog reference coverage', () => {
	it('has a queryable rule for every foreign key that points at a catalog', async () => {
		await withTestDb(async ({ db }) => {
			const tables = catalogRecordTypes().map((catalog) => ({
				catalog,
				table: deletableRecordTable(catalog),
			}));
			const references = await referencesTo(
				db,
				tables.map((entry) => entry.table),
			);

			const unruled: string[] = [];
			const unqueryable: string[] = [];

			for (const { catalog, table } of tables) {
				const covered = new Set(
					deleteReferenceScopes(catalog)
						.map((rule) =>
							rule.scope.kind === 'direct' ? `${rule.table}.${rule.scope.column}` : null,
						)
						.filter((key): key is string => key !== null),
				);

				for (const reference of references.filter((entry) => entry.parent === table)) {
					const key = `${reference.child}.${reference.column}`;
					if (!covered.has(key)) {
						unruled.push(`${catalog}: ${key}`);
					}
					// `countRules` filters on both columns unconditionally, so a referrer
					// missing either would fail the count with a missing-column error
					// rather than answering it.
					if (!reference.orgScoped || !reference.softDeletes) {
						unqueryable.push(`${catalog}: ${key}`);
					}
				}
			}

			expect(unruled).toEqual([]);
			expect(unqueryable).toEqual([]);
		});
	});
});

interface CatalogReferrer {
	readonly parent: string;
	readonly child: string;
	readonly column: string;
	readonly orgScoped: boolean;
	readonly softDeletes: boolean;
}

/** Read from the live schema, because the migration text is not the schema. */
async function referencesTo(
	db: Kysely<SimmerDatabase>,
	tables: readonly string[],
): Promise<readonly CatalogReferrer[]> {
	const result = await sql<{
		readonly parent: string;
		readonly child: string;
		readonly column: string;
		readonly org_scoped: boolean;
		readonly soft_deletes: boolean;
	}>`
		select
			ccu.table_name  as parent,
			kcu.table_name  as child,
			kcu.column_name as column,
			exists (
				select 1 from information_schema.columns oc
				where oc.table_schema = current_schema()
					and oc.table_name = kcu.table_name
					and oc.column_name = 'organization_id'
			) as org_scoped,
			exists (
				select 1 from information_schema.columns dc
				where dc.table_schema = current_schema()
					and dc.table_name = kcu.table_name
					and dc.column_name = 'deleted_at'
			) as soft_deletes
		from information_schema.table_constraints tc
		join information_schema.key_column_usage kcu
			on kcu.constraint_name = tc.constraint_name
			and kcu.table_schema = tc.table_schema
		join information_schema.constraint_column_usage ccu
			on ccu.constraint_name = tc.constraint_name
			and ccu.table_schema = tc.table_schema
		where tc.constraint_type = 'FOREIGN KEY'
			and tc.table_schema = current_schema()
			and ccu.table_name = any(${sql.val(tables)}::text[])
	`.execute(db);

	return result.rows.map((row) => ({
		parent: row.parent,
		child: row.child,
		column: row.column,
		orgScoped: row.org_scoped,
		softDeletes: row.soft_deletes,
	}));
}
