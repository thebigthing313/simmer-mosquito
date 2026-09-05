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
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

let modules: readonly CollectionModule[] = [];

/**
 * Long, because this is fifty modules through Vite's transform and the suite
 * runs four files at a time. It measured 1.3s on an idle machine and blew past
 * 22s with two full runs going at once, so the five-second default was timing
 * the machine rather than anything this file asserts. That is issue #509, and
 * `import-side-effects.test.ts` sizes its own budget the same way.
 *
 * A module that genuinely does not resolve still fails: a specifier that names
 * nothing rejects rather than hangs, so the hook reports the resolution error
 * and takes every case in the file down with it.
 */
const IMPORT_TIMEOUT_MS = 60_000;

/**
 * Import every collection module, once for the file.
 *
 * Once, because six of the cases used to re-await all fifty and whichever ran
 * first paid the whole transform against a five-second assertion budget. The
 * cost is setup, so it is spent in a hook with a budget of its own and the
 * cases keep the default: they read this array, and nothing in them can be
 * slow.
 *
 * With no source installed, so this is also the assertion that importing one
 * builds nothing. A module that called its factory at module scope throws here
 * rather than reach the cases below.
 */
beforeAll(async () => {
	modules = await Promise.all(
		moduleNames().map(async (name) => {
			const table = name.replace(/\.ts$/, '');
			const exports = (await import(`../../../../lib/collections/${table}.ts`)) as Record<
				string,
				unknown
			>;
			return { name, table, exports, own: exports[table] as Resolver };
		}),
	);
}, IMPORT_TIMEOUT_MS);

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
