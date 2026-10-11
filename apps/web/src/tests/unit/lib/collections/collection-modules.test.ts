/**
 * The sweep over every collection module, run against what they declare.
 *
 * This used to read all fifty modules as text, because importing one built a
 * collection and opened a shape stream. It looked for a module that had
 * assembled its own `serverUrl` instead of spreading the shared options, which
 * is the failure that looks like the environment rather than like a diff.
 *
 * Two of those checks are gone because the shape of a declaration removed them:
 * a module names its factory and never calls it, so there are no options for it
 * to assemble and no server URL for it to reach. What is left is worth
 * asserting rather than reading, and it is asserted here by importing.
 *
 * Prior art for asserting across every collection at once:
 * `packages/sync/src/tests/unit/index.test.ts`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CollectionDeclaration, SyncedRow } from '../../../../lib/collections/registry';
import { installMemoryCollections } from './memory-collections';

const collectionsDir = join(import.meta.dirname, '../../../../lib/collections');

/** The five modules in the folder that are not a table. */
const support = new Set([
	'client-options.ts',
	'mutate.ts',
	'registry.ts',
	'sync-source.ts',
	'transact.ts',
]);

/** A resolver, as this file reads one back out of a module. */
type Resolver = (() => { readonly id: string; readonly indexes: ReadonlyMap<number, unknown> }) & {
	readonly declaration: CollectionDeclaration<SyncedRow>;
};

/** One imported module: the file, its table, and what it exported. */
interface CollectionModule {
	readonly name: string;
	readonly table: string;
	/** The whole namespace, because one case below is about what else is on it. */
	readonly exports: Record<string, unknown>;
	/** The export named for the table. Missing is a case below, not a crash here. */
	readonly own: Resolver;
}

function moduleNames(): readonly string[] {
	return readdirSync(collectionsDir).filter((name) => name.endsWith('.ts') && !support.has(name));
}

/**
 * Every collection module, imported once for the file, at module scope.
 *
 * This was a `beforeAll` with a 60s budget of its own (#509). Fifty modules
 * through Vite's transform is the slow part, and with three full runs going at
 * once the hook took 46.8s of its 60s, so the budget was timing the machine
 * rather than anything this file asserts (#1455). Vitest applies no timeout to
 * module scope, which is how `import-side-effects.test.ts` has run its sweeps
 * since #545, and the watchdog in `vitest.shared.ts` is still the bound on a
 * hang.
 *
 * The move costs no coverage. No source is installed when this runs, since the
 * `beforeEach` below that installs one runs after collection, so a module that
 * calls its factory while it loads still throws here and fails the file. A
 * specifier naming no module rejects rather than hangs, and fails it too.
 */
const modules: readonly CollectionModule[] = await Promise.all(
	moduleNames().map(async (name) => {
		const table = name.replace(/\.ts$/, '');
		const exports = (await import(`../../../../lib/collections/${table}.ts`)) as Record<
			string,
			unknown
		>;
		return { name, table, exports, own: exports[table] as Resolver };
	}),
);

describe('collection modules', () => {
	it('finds the collections to check', () => {
		// So a broken filter cannot make the sweep below vacuously green.
		expect(modules.length).toBeGreaterThan(40);
	});

	it('exports a resolver named for its table', () => {
		const offending = modules
			.filter(({ own }) => own === undefined)
			.map(({ name, table }) => `${name} exports no resolver named ${table}`);

		expect(offending).toEqual([]);
	});

	it('names each declaration for the table its file is named for', () => {
		const offending = modules
			.filter(({ table, own }) => own.declaration.table !== table)
			.map(({ name }) => name);

		expect(offending).toEqual([]);
	});

	it('exports its declaration and nothing else', () => {
		// A module that also exported a built collection would compile, sync, and
		// put the whole seam back: a hook could name it, and a test could not
		// replace it. Types erase, so what is left at runtime is one function.
		const offending = modules
			.map(({ name, table, exports }) => ({ name, table, exported: Object.keys(exports) }))
			.filter(({ table, exported }) => exported.length !== 1 || exported[0] !== table)
			.map(({ name, exported }) => `${name}: ${exported}`);

		expect(offending).toEqual([]);
	});

	it('builds nothing until a source is installed', () => {
		const { own } = modules[0] as CollectionModule;

		expect(() => own()).toThrow(/No collection source is installed/);
	});
});

describe('every collection, built', () => {
	beforeEach(() => {
		installMemoryCollections();
	});

	it('is named for its table and indexed on its primary key', () => {
		for (const { own } of modules) {
			const collection = own();
			expect(collection.id).toBe(own.declaration.table);
			// The registry creates this one for every table, because a lazily loaded
			// join needs the join column indexed and every table is joined by `id`.
			expect(collection.indexes.size).toBeGreaterThan(0);
		}
	});

	it('indexes the columns a join or an include loads it by', () => {
		// Without the index a lazily loaded join falls back to scanning whatever
		// the collection already holds and logs `Join requires an index` (#1412).
		const expected: Readonly<Record<string, string>> = {
			samples: 'inspection_id',
			sample_species: 'sample_id',
			collection_species: 'collection_id',
			route_items: 'route_id',
			memberships: 'profile_id',
		};
		const missing = Object.entries(expected).filter(([table, column]) => {
			const module = modules.find((candidate) => candidate.table === table);
			const indexes = module === undefined ? [] : [...module.own().indexes.values()];
			return !indexes.some(
				(index) =>
					(index as { expression?: { path?: readonly string[] } }).expression?.path?.join('.') ===
					column,
			);
		});

		expect(missing).toEqual([]);
	});

	it('answers with the same collection every time', () => {
		// A live query dedupes by collection identity, and two collections over one
		// table would each open their own shape and disagree about what is in it.
		for (const { own } of modules) {
			expect(own()).toBe(own());
		}
	});
});

/**
 * The matrix in `docs/sync.md`, which says it is what these modules say.
 *
 * Nothing read it before, so a table that changed mode left the doc describing
 * the old one. The doc is the only place the per-table reasoning is written
 * down, so it being wrong is worse than it being absent.
 */
describe('docs/sync.md', () => {
	const doc = readFileSync(join(import.meta.dirname, '../../../../../../../docs/sync.md'), 'utf8');

	function documented(column: 2 | 3): ReadonlySet<string> {
		const matrix = doc.slice(doc.indexOf('## Web matrix'), doc.indexOf('**Excluded** here'));
		const tables = new Set<string>();
		for (const line of matrix.split('\n')) {
			const cells = line.split('|');
			if (cells.length < 5 || cells[1]?.trim() === 'Area' || cells[2]?.includes('---')) continue;
			for (const match of (cells[column] ?? '').matchAll(/`(\w+)`/g)) {
				tables.add(match[1] as string);
			}
		}
		return tables;
	}

	it('lists every table this app syncs, under the mode the module declares', () => {
		const eager = documented(2);
		const onDemand = documented(3);
		const wrong: string[] = [];

		for (const { own } of modules) {
			const { table, syncMode } = own.declaration;
			const listed = eager.has(table) ? 'eager' : onDemand.has(table) ? 'on-demand' : 'nowhere';
			if (listed !== syncMode) wrong.push(`${table}: declared ${syncMode}, documented ${listed}`);
		}

		expect(wrong).toEqual([]);
	});

	it('lists no table this app has no module for', () => {
		const declared = new Set(modules.map(({ own }) => own.declaration.table));
		const orphaned = [...documented(2), ...documented(3)].filter((table) => !declared.has(table));

		expect(orphaned).toEqual([]);
	});
});
