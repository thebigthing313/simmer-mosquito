/**
 * The registry's own rules, on a declaration nothing else uses.
 *
 * `collection-modules.test.ts` beside this asserts the same things across all
 * fifty-three real tables. This covers the cases a real module cannot produce:
 * two declarations claiming one table, and a resolve with nothing installed
 * after something was.
 */

import { createCollection } from '@tanstack/db';
import { describe, expect, it } from 'vitest';
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

function widgetDeclaration(table: string): CollectionDeclaration<Widget> {
	return {
		table,
		syncMode: 'eager',
		mutations: false,
		create: () => {
			built += 1;
			return createCollection<Widget>({
				id: table,
				getKey: (row) => row.id,
				sync: { sync: (controls) => controls.markReady() },
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

	it('refuses two declarations over one table', () => {
		install();
		const first = declareCollection(widgetDeclaration('widgets_twice'));
		const second = declareCollection(widgetDeclaration('widgets_twice'));
		first();

		expect(() => second()).toThrow(/Two collections declare the table widgets_twice/);
	});
});
