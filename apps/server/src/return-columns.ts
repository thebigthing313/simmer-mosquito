/**
 * What a command response answers with, derived rather than declared.
 *
 * A write endpoint answers `{ [key]: row, txid }`, and the row is whatever the
 * `.returning(...)` list named. Those lists were hand-written, 43 of them, one
 * per table, sitting beside the generated row schemas that say what the same
 * table's Electric shape carries. Nothing compared the two, and 34 had drifted:
 * every one of them an omission, from two audit columns up to a source
 * reduction that answered with `id`, `organization_id`, `metadata` and the two
 * timestamps and none of the record's own fields (#635).
 *
 * So the list comes from the table's row schema now, which is the same list
 * `sync-shapes.ts` forces on the shape route. `OMIT` and `WITHHELD` are applied
 * there, so the response and the sync stream carry the same columns by
 * construction: `geom`, `geojson`, `deleted_at` and `deleted_by_profile_id` are
 * off every response because `OMIT` holds them, and a membership's
 * `invited_email` is off because `WITHHELD` does. A migration that adds a
 * column reaches the response the moment it reaches the schema.
 *
 * It is the schema's field list, not the schema minus `ServerOwnedColumns`.
 * That register says which columns a request body may not name, which is the
 * other direction: subtracting it from `habitats` would take `organization_id`
 * and both timestamps off a response that has always carried them.
 */

import type { RowColumn, SelectedRow } from '@simmer-mosquito/db';
import { type SyncedTable, syncedColumnsOf, tableSchemas } from '@simmer-mosquito/sync/contract';

/**
 * The fields one table's row schema declares, held to being its columns.
 *
 * Both registers are generated from `packages/db/schema.sql`, so the
 * intersection takes nothing away today. It is what makes the list satisfy
 * `SelectedRow` without a cast at any of the 166 call sites, and the unit test
 * beside this module fails if it ever starts narrowing something.
 */
type SchemaColumn<TTable extends SyncedTable> = keyof (typeof tableSchemas)[TTable]['shape'] &
	RowColumn<TTable>;

/** The columns a command response for one table carries. */
export type ReturnColumns<TTable extends SyncedTable> = readonly SchemaColumn<TTable>[];

/** The row a command response for one table carries. */
export type CommandRow<TTable extends SyncedTable> = SelectedRow<TTable, ReturnColumns<TTable>>;

/**
 * A row schema field that is not a column of its table, over every table.
 *
 * Empty, and `return-columns.test.ts` is what says so. `SchemaColumn`
 * intersects rather than asserts, so a field that stopped being a column would
 * quietly leave the response instead of failing the build, and the two
 * registers are generated from `packages/db/schema.sql` by two scripts that do
 * not read each other. This is the join nothing else makes.
 */
export type SchemaFieldNotAColumn = {
	[TTable in SyncedTable]: Exclude<
		keyof (typeof tableSchemas)[TTable]['shape'] & string,
		RowColumn<TTable>
	>;
}[SyncedTable];

/**
 * Every table's return columns, keyed by table name.
 *
 * A record rather than a function, so `returnColumns.habitats` narrows to that
 * table's columns and a table name that does not exist is a missing property
 * rather than a runtime `undefined`.
 *
 * The one cast is here: `syncedColumnsOf` reads `Object.keys` off a zod shape
 * and so answers `readonly string[]`, and the mapped type above is what says
 * which strings those are for each key.
 */
export const returnColumns = Object.fromEntries(
	Object.entries(tableSchemas).map(([table, schema]) => [table, syncedColumnsOf(schema)]),
) as { readonly [TTable in SyncedTable]: ReturnColumns<TTable> };
