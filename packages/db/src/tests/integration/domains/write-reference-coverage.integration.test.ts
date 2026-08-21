import { expect, it } from 'vitest';
import {
	catalogRecordTypes,
	deletableRecordTable,
	deleteReferenceScopes,
	type Kysely,
	recordReferenceColumns,
	referencedRecordTables,
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

/**
 * The record half's registry answers to the schema too.
 *
 * `REFERENCED_RECORD_TABLES` is a hand-written list and the gate's query filters
 * on `organization_id` and `deleted_at` unconditionally. A table added there
 * without one of the two would not gate loosely; it would fail every write that
 * named it with a missing-column error, which is a worse failure and one no
 * typecheck can see.
 */
describeDbIntegration('record reference coverage', () => {
	it('has organization_id and deleted_at on every referenceable record table', async () => {
		await withTestDb(async ({ db }) => {
			const missing: string[] = [];

			for (const table of referencedRecordTables()) {
				const columns = await columnsOf(db, table);
				for (const column of ['organization_id', 'deleted_at']) {
					if (!columns.has(column)) {
						missing.push(`${table}.${column}`);
					}
				}
			}

			expect(missing).toEqual([]);
		});
	});
});

async function columnsOf(db: Kysely<SimmerDatabase>, table: string): Promise<ReadonlySet<string>> {
	const result = await sql<{ readonly column_name: string }>`
		select column_name
		from information_schema.columns
		where table_schema = current_schema() and table_name = ${table}
	`.execute(db);

	if (result.rows.length === 0) {
		throw new Error(`${table} is not a table in this schema.`);
	}

	return new Set(result.rows.map((row) => row.column_name));
}

/**
 * Every foreign key a command body can name has a registry entry.
 *
 * The registry is hand-written and a hand-written list cannot notice what it
 * omits — the same argument the catalog coverage test above makes, asked of the
 * other half. A column added by a later migration that points at a tenant-owned
 * record would otherwise take its id from the payload with nothing checking
 * whose it was, which is #200 all over again.
 *
 * Four kinds of column are exempt, and each is exempt for a reason a query can
 * see rather than by name:
 *
 * - a parent with no `organization_id`, so there is no tenancy to check;
 * - a parent that is a catalog, gated by name at the writer with `is_active`;
 * - the three attribution columns, written from the session, never a payload;
 * - the two weather tables, whose nullable `organization_id` this gate's
 *   predicate would read as "belongs to nobody, so refuse".
 */
describeDbIntegration('record reference registry coverage', () => {
	it('has an entry for every foreign key pointing at a tenant-owned record', async () => {
		await withTestDb(async ({ db }) => {
			const catalogs = new Set(
				catalogRecordTypes().map((catalog) => deletableRecordTable(catalog)),
			);
			const registry = recordReferenceColumns();
			const attribution = new Set([
				'created_by_profile_id',
				'updated_by_profile_id',
				'deleted_by_profile_id',
			]);
			const nullableOrgParents = new Set(['weather_sources', 'weather_summaries']);

			const unregistered: string[] = [];
			const misdirected: string[] = [];

			for (const reference of await tenantOwnedReferences(db)) {
				if (
					catalogs.has(reference.parent) ||
					attribution.has(reference.column) ||
					nullableOrgParents.has(reference.parent)
				) {
					continue;
				}

				const registered = registry.get(reference.column);
				if (registered === undefined) {
					unregistered.push(`${reference.child}.${reference.column} -> ${reference.parent}`);
				} else if (registered !== reference.parent) {
					misdirected.push(
						`${reference.column} is registered against ${registered}, but ` +
							`${reference.child}.${reference.column} points at ${reference.parent}`,
					);
				}
			}

			expect(unregistered).toEqual([]);
			// The registry is keyed by column, which only works while no column name
			// points at two tables. This is the assertion that keeps that true.
			expect(misdirected).toEqual([]);
		});
	});
});

interface TenantOwnedReference {
	readonly child: string;
	readonly column: string;
	readonly parent: string;
}

/** Every foreign key whose parent table carries an `organization_id`. */
async function tenantOwnedReferences(
	db: Kysely<SimmerDatabase>,
): Promise<readonly TenantOwnedReference[]> {
	const result = await sql<{
		readonly child: string;
		readonly column: string;
		readonly parent: string;
	}>`
		select
			kcu.table_name  as child,
			kcu.column_name as column,
			ccu.table_name  as parent
		from information_schema.table_constraints tc
		join information_schema.key_column_usage kcu
			on kcu.constraint_name = tc.constraint_name
			and kcu.table_schema = tc.table_schema
		join information_schema.constraint_column_usage ccu
			on ccu.constraint_name = tc.constraint_name
			and ccu.table_schema = tc.table_schema
		where tc.constraint_type = 'FOREIGN KEY'
			and tc.table_schema = current_schema()
			and exists (
				select 1 from information_schema.columns oc
				where oc.table_schema = current_schema()
					and oc.table_name = ccu.table_name
					and oc.column_name = 'organization_id'
			)
	`.execute(db);

	return result.rows;
}
