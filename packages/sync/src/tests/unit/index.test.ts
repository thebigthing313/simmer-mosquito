import { describe, expect, it } from 'vitest';
import { electricShapeCollectionOptions, tableSchemas } from '../../index.js';

/**
 * What is left of a test that used to read fifty-five descriptors.
 *
 * Most of it asserted a descriptor's own column list back at itself, table by
 * table. Those lists are gone: the server takes a shape's columns from the
 * table's schema, and the client never had a use for them — the list it sent was
 * stripped server-side and unread by the Electric client. The checks below are
 * the ones that were about something other than the descriptors.
 */
describe('electricShapeCollectionOptions', () => {
	it('names the collection after the table and keys it on the row id', () => {
		const options = electricShapeCollectionOptions({
			table: 'units',
			url: 'https://example.test/sync/shapes/units',
			// The caller's, not the table's: how a table streams is the app's decision,
			// and `apps/web` makes it in `src/sync/sync-modes.ts`.
			syncMode: 'eager',
		});

		expect(options.id).toBe('units');
		expect(options.syncMode).toBe('eager');
		expect(options.getKey({ id: 'unit-1' })).toBe('unit-1');
	});

	it('gives a collection no write handlers unless it is handed some', () => {
		// Whether a table accepts writes is the app's decision, made where the
		// collection is created — nothing about the table can make it writable.
		const options = electricShapeCollectionOptions({
			table: 'units',
			url: 'https://example.test/sync/shapes/units',
			syncMode: 'eager',
		}) as Record<string, unknown>;

		expect(options.onInsert).toBeUndefined();
		expect(options.onUpdate).toBeUndefined();
		expect(options.onDelete).toBeUndefined();
	});
});

describe('collection schemas', () => {
	it('declares no server-only geometry column on any table', () => {
		// Raw geometry is binary and `geojson` runs to megabytes a row; both are
		// served by the `/map/*` endpoints instead. The trigger-maintained centroid
		// (`lat`, `lng`, `geom_type`) may sync, which is why this names columns
		// rather than refusing spatial tables outright.
		//
		// It reads the schemas because they are now what a shape's column list is
		// made of. This walked the descriptors until they stopped deciding it.
		const offending = Object.entries(tableSchemas).flatMap(([table, schema]) =>
			Object.keys(schema.shape)
				.filter((field) => field === 'geom' || field === 'geojson')
				.map((field) => `${table}.${field}`),
		);

		expect(offending).toEqual([]);
	});
});
