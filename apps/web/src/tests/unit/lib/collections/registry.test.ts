/**
 * The registry's own rules, on a declaration nothing else uses.
 *
 * `collection-modules.test.ts` beside this asserts the same things across all
 * fifty-three real tables. This covers what a real module cannot produce: a
 * second declaration over one table, which is what Vite hands back when it
 * re-executes an edited module in development.
 */

import { BasicIndex, createCollection, createLiveQueryCollection, eq, toArray } from '@tanstack/db';
import { describe, expect, it, vi } from 'vitest';
import {
	type CollectionDeclaration,
	type CollectionOf,
	declareCollection,
	installCollections,
	type SyncedRow,
} from '../../../../lib/collections/registry';

interface Widget extends SyncedRow {
	readonly name: string;
}

let built = 0;

function widgetDeclaration(
	table: string,
	rows: readonly Widget[] = [],
): CollectionDeclaration<Widget> {
	return {
		table,
		syncMode: 'eager',
		mutations: false,
		create: () => {
			built += 1;
			return createCollection<Widget>({
				id: table,
				getKey: (row) => row.id,
				sync: {
					sync: ({ begin, write, commit, markReady }) => {
						begin();
						for (const row of rows) write({ type: 'insert', value: row });
						commit();
						markReady();
					},
				},
			}) as unknown as CollectionOf<Widget>;
		},
	};
}

function install(): void {
	installCollections({ build: (declaration) => declaration.create({} as never) });
}

describe('declareCollection', () => {
	it('builds nothing until the collection is asked for', () => {
		install();
		const before = built;

		const widgets = declareCollection(widgetDeclaration('widgets_unused'));

		expect(built).toBe(before);
		expect(widgets.declaration.table).toBe('widgets_unused');
	});

	it('builds once and answers with the same collection after that', () => {
		install();
		const widgets = declareCollection(widgetDeclaration('widgets_once'));
		const before = built;

		expect(widgets()).toBe(widgets());
		expect(built).toBe(before + 1);
	});

	it('forgets what the last source built when a new one is installed', () => {
		// Which is what lets a test start from empty tables rather than from the
		// rows the previous one seeded.
		install();
		const widgets = declareCollection(widgetDeclaration('widgets_reinstalled'));
		const first = widgets();

		install();

		expect(widgets()).not.toBe(first);
	});

	it('answers a second declaration over one table with the collection it already built', () => {
		// Which is what a hot reload of a collection module produces. Building a
		// second collection for the table would put two shapes on it, each holding
		// its own idea of what the table contains.
		install();
		const first = declareCollection(widgetDeclaration('widgets_twice'));
		const second = declareCollection(widgetDeclaration('widgets_twice'));

		expect(second()).toBe(first());
	});
});

interface Part extends SyncedRow {
	readonly widget_id: string;
}

/**
 * An on-demand table whose `loadSubset` writes every part it holds, and whose
 * declaration indexes the column a correlated include loads it by.
 */
function partDeclaration(table: string, rows: readonly Part[]): CollectionDeclaration<Part> {
	return {
		table,
		syncMode: 'on-demand',
		mutations: false,
		create: () => {
			const collection = createCollection<Part>({
				id: table,
				getKey: (row) => row.id,
				syncMode: 'on-demand',
				sync: {
					sync: ({ begin, write, commit, markReady }) => {
						markReady();
						return {
							loadSubset: () => {
								begin();
								for (const row of rows) {
									if (!collection.has(row.id)) write({ type: 'insert', value: row });
								}
								commit();
								return true;
							},
						};
					},
				},
			});
			return collection as unknown as CollectionOf<Part>;
		},
		index: (collection) => {
			collection.createIndex((row) => row.widget_id, { indexType: BasicIndex });
		},
	};
}

/** The field paths a collection's indexes are on, written `a.b`. */
function indexedPaths(collection: {
	readonly indexes: ReadonlyMap<number, { readonly expression: unknown }>;
}): string[] {
	return [...collection.indexes.values()]
		.map((index) => (index.expression as { path?: readonly string[] }).path?.join('.') ?? '')
		.sort();
}

describe('the indexes a declaration asks for', () => {
	it('are on the collection the first time it is resolved', () => {
		install();
		const parts = declareCollection(partDeclaration('parts_first', []));

		expect(indexedPaths(parts())).toEqual(['id', 'widget_id']);
	});

	it('are put back when the collection is resolved after a cleanup', async () => {
		// TanStack DB's garbage collection runs `cleanup()` on a collection nothing
		// has subscribed to for its `gcTime`, and cleanup clears every index. The
		// registry still answers with that collection, so without a rebuild every
		// join into it loses its index for the rest of the session (#1412).
		install();
		const parts = declareCollection(partDeclaration('parts_cleaned', []));
		await parts().cleanup();

		expect(indexedPaths(parts())).toEqual(['id', 'widget_id']);
	});

	it('still serve a correlated include after the joined collection was cleaned up', async () => {
		install();
		const widgets = declareCollection(
			widgetDeclaration('widgets_joined', [{ id: 'w1', name: 'Widget' }]),
		);
		const parts = declareCollection(
			partDeclaration('parts_joined', [
				{ id: 'p1', widget_id: 'w1' },
				{ id: 'p2', widget_id: 'w1' },
			]),
		);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		async function readParts(): Promise<readonly unknown[]> {
			const query = createLiveQueryCollection({
				startSync: true,
				query: (q) =>
					q.from({ widget: widgets() }).select(({ widget }) => ({
						id: widget.id,
						parts: toArray(
							q
								.from({ part: parts() })
								.where(({ part }) => eq(part.widget_id, widget.id))
								.select(({ part }) => ({ id: part.id })),
						),
					})),
			});
			await query.preload();
			const rows = query.toArray.map((row) => row.parts);
			await query.cleanup();
			return rows;
		}

		try {
			await readParts();
			await parts().cleanup();
			const after = await readParts();

			expect(after).toEqual([[{ id: 'p1' }, { id: 'p2' }]]);
			const joinWarnings = warn.mock.calls.filter((call) =>
				String(call[0]).includes('Join requires an index'),
			);
			expect(joinWarnings).toEqual([]);
		} finally {
			warn.mockRestore();
		}
	});
});
