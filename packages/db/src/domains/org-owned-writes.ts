import { type RawBuilder, type Selectable, sql, type Transaction } from 'kysely';

import type { GeoJsonGeometry, SimmerDatabase } from '../tables.js';
import { assertWriteReferences, recordReferencesIn } from './write-references.js';

/**
 * Every table a tenant owns rows in directly: it carries the tenant column, and
 * it is soft-deleted rather than removed.
 *
 * Derived from the schema rather than listed, because a hand-written list is
 * only as safe as the file that wrote it. Seven command families each kept their
 * own `WriteTable` union, and `control-operations` alone kept two that disagreed
 * — `updateActionRow` named five tables, its neighbouring `softDelete` named
 * eight. Passing a table without `organization_id` is now a build error instead
 * of something each union had to remember, which is how ADR 0008's tenant-scope
 * rule becomes checkable.
 */
export type OrgOwnedTable = {
	[K in keyof SimmerDatabase]: SimmerDatabase[K] extends {
		organization_id: string;
		deleted_at: unknown;
		updated_at: unknown;
	}
		? K
		: never;
}[keyof SimmerDatabase];

/**
 * The org-owned tables that carry geometry, and so can be a location source.
 *
 * Same reasoning as `OrgOwnedTable`: a caller no longer has to know which tables
 * have a `geojson` column, because the compiler does.
 */
export type GeomTable = {
	[K in OrgOwnedTable]: SimmerDatabase[K] extends { geojson: unknown } ? K : never;
}[OrgOwnedTable];

/**
 * The transaction id the client waits on before trusting its optimistic write.
 *
 * Thirteen copies of this existed across the command families — seven in their
 * `shared.ts` files, three inline in `foundation-commands/shared.ts`, three more
 * in the flat command files.
 */
export async function readCurrentTransactionId(trx: Transaction<SimmerDatabase>): Promise<number> {
	const result = await sql<{
		txid: string;
	}>`select pg_current_xact_id()::xid::text as txid`.execute(trx);
	const txid = result.rows[0]?.txid;
	if (txid === undefined) {
		throw new Error('Unable to read current transaction id.');
	}
	return Number.parseInt(txid, 10);
}

/** A calendar date the database stores without a time zone attached. */
export function localDateColumn(value: string): RawBuilder<Date> {
	return sql<Date>`${value}::date`;
}

/**
 * The shape a returning-column list actually produces.
 *
 * Derived from the schema and from the list itself, so the two cannot drift.
 * Nine command families each kept a hand-written camelCase mirror of their
 * lists, 34 of them, and a mirror is only correct until somebody edits one end.
 */
export type SelectedRow<
	TTable extends keyof SimmerDatabase,
	TColumns extends readonly (keyof Selectable<SimmerDatabase[TTable]> & string)[],
> = Pick<Selectable<SimmerDatabase[TTable]>, TColumns[number]>;

/**
 * Update one row a tenant owns, scoped so it cannot reach another tenant's or a
 * deleted one.
 *
 * Returns `null` rather than throwing when nothing matched: whether that means
 * "not yours" or "not there" is not a distinction this layer can draw, and the
 * caller in `apps/server` is the one that knows it answers 404 either way.
 *
 * Every record id the patch names is checked first. This is the one seam every
 * update goes through, so #200's rule holds for all of them from here rather
 * than from a line each writer has to remember; the stored row is read back, so
 * a reference the patch repeats unchanged is not refused. Catalog ids are gated
 * at the writer instead, because the two documented exceptions to that rule are
 * only visible there.
 */
export async function updateRow<
	TTable extends OrgOwnedTable,
	const TColumns extends readonly (keyof Selectable<SimmerDatabase[TTable]> & string)[],
>(
	trx: Transaction<SimmerDatabase>,
	table: TTable,
	id: string,
	organizationId: string,
	set: Record<string, unknown>,
	columns: TColumns,
): Promise<SelectedRow<TTable, TColumns> | null> {
	await assertWriteReferences(trx, {
		organizationId,
		write: { kind: 'update', table, recordId: id },
		references: recordReferencesIn(set),
	});

	const row = await trx
		.updateTable(table as OrgOwnedTable)
		.set({ ...set, updated_at: sql`now()` } as never)
		.where('id', '=', id)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(columns as never)
		.executeTakeFirst();
	return row === undefined ? null : (row as unknown as SelectedRow<TTable, TColumns>);
}

/**
 * Retire a row the tenant owns, recording who did it.
 *
 * The same `deleted_at is null` guard as `updateRow` makes this idempotent: a
 * second delete matches nothing and answers `null`.
 */
export async function softDelete<
	TTable extends OrgOwnedTable,
	const TColumns extends readonly (keyof Selectable<SimmerDatabase[TTable]> & string)[],
>(
	trx: Transaction<SimmerDatabase>,
	table: TTable,
	id: string,
	organizationId: string,
	actorProfileId: string,
	columns: TColumns,
): Promise<SelectedRow<TTable, TColumns> | null> {
	const row = await trx
		.updateTable(table as OrgOwnedTable)
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: actorProfileId,
			updated_by_profile_id: actorProfileId,
			updated_at: sql`now()`,
		} as never)
		.where('id', '=', id)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(columns as never)
		.executeTakeFirst();
	return row === undefined ? null : (row as unknown as SelectedRow<TTable, TColumns>);
}

/**
 * A GeoJSON value as a PostGIS geometry, in the projection the schema stores.
 *
 * Accepts either a bare geometry or a Feature wrapping one, because both reach
 * the server: a domain location source carries the geometry itself, while a
 * geometry read back out of another row arrives already unwrapped.
 */
export function geojsonToGeom(geojson: unknown): RawBuilder<string> {
	const serialized = JSON.stringify(geojson);
	return sql<string>`st_force2d(st_setsrid(st_geomfromgeojson(
		case
			when (${serialized}::jsonb -> 'geometry') is not null
				then (${serialized}::jsonb -> 'geometry')::text
			else ${serialized}
		end
	), 4326))`;
}

/**
 * The geometry of another row the same tenant owns.
 *
 * Answers `undefined` when the row is absent, another tenant's, or deleted —
 * the 404 that fact becomes is `apps/server`'s to raise, so that this package
 * stays free of HTTP vocabulary. The tenancy predicate was re-typed in three
 * families before living here.
 */
export async function loadGeojson(
	trx: Transaction<SimmerDatabase>,
	table: GeomTable,
	id: string,
	organizationId: string,
): Promise<GeoJsonGeometry | undefined> {
	const row = await trx
		.selectFrom(table)
		.select('geojson')
		.where('id', '=', id)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	return row?.geojson;
}
