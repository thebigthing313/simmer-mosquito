/**
 * The two things about `returnColumns` a database cannot answer.
 *
 * `command-return-columns.integration.test.ts` reads a real write back and
 * checks the keys it came home with, which is the behaviour. What it cannot see
 * is a table that fell out of the record entirely, or a row schema field that
 * has stopped being a column of its table: both leave every write that still
 * runs answering correctly, and the second one narrows a response silently
 * because `SchemaColumn` intersects rather than asserts.
 */

import { syncedColumnsOf, tableSchemas } from '@simmer-mosquito/sync/contract';
import { describe, expect, it } from 'vitest';
import { returnColumns, type SchemaFieldNotAColumn } from '../../return-columns.js';

describe('returnColumns', () => {
	it('answers for every synced table, with that table’s schema fields', () => {
		const tables = Object.keys(tableSchemas) as (keyof typeof tableSchemas)[];

		// The floor: a `SyncedTable` with no entry would be a writer reaching for
		// `undefined` and selecting nothing.
		expect(tables.length).toBeGreaterThanOrEqual(56);
		for (const table of tables) {
			expect(returnColumns[table]).toEqual(syncedColumnsOf(tableSchemas[table]));
			expect(returnColumns[table].length).toBeGreaterThan(0);
		}
	});

	it('keeps the four control-method tables on one list', () => {
		// `writers/control-methods.ts` serves all four from
		// `returnColumns.application_methods`, because the four tables are the same
		// nine fields. A column added to one of them makes that wrong, and this is
		// the only place that would say so.
		const methods = syncedColumnsOf(tableSchemas.application_methods);

		expect(syncedColumnsOf(tableSchemas.source_reduction_methods)).toEqual(methods);
		expect(syncedColumnsOf(tableSchemas.outreach_methods)).toEqual(methods);
		expect(syncedColumnsOf(tableSchemas.biocontrol_methods)).toEqual(methods);
	});

	it('holds every row schema field to being a column of its table', () => {
		// The assertion is the annotation, not the expectation below it: a field
		// that is not a column widens `SchemaFieldNotAColumn` past `never` and
		// this assignment stops compiling. Nothing at runtime can see it, because
		// the intersection narrows the type and leaves the list alone.
		const stray: never[] = [] as SchemaFieldNotAColumn[];

		expect(stray).toEqual([]);
	});
});
