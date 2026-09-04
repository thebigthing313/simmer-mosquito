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

function moduleNames(): readonly string[] {
	return readdirSync(collectionsDir).filter((name) => name.endsWith('.ts') && !support.has(name));
}

/**
 * Import every collection module.
 *
 * With no source installed, so this is also the assertion that importing one
 * builds nothing: a module that called its factory at module scope would throw
 * here rather than reach the cases below.
 */
async function resolvers(): Promise<readonly { readonly name: string; readonly own: Resolver }[]> {
	return Promise.all(
		moduleNames().map(async (name) => {
			const table = name.replace(/\.ts$/, '');
			const module = (await import(`../../../../lib/collections/${table}.ts`)) as Record<
				string,
				Resolver
			>;
			const own = module[table];
			expect(own, `${name} exports no resolver named ${table}`).toBeDefined();
			return { name, own: own as Resolver };
		}),
	);
}

describe('collection modules', () => {
	it('finds the collections to check', async () => {
		// So a broken filter cannot make the sweep below vacuously green.
		expect((await resolvers()).length).toBeGreaterThan(40);
	});

	it('names each declaration for the table its file is named for', async () => {
		const offending = (await resolvers())
			.filter(({ name, own }) => own.declaration.table !== name.replace(/\.ts$/, ''))
			.map(({ name }) => name);

		expect(offending).toEqual([]);
	});

	it('exports its declaration and nothing else', async () => {
		// A module that also exported a built collection would compile, sync, and
		// put the whole seam back: a hook could name it, and a test could not
		// replace it. Types erase, so what is left at runtime is one function.
		const offending: string[] = [];
		for (const name of moduleNames()) {
			const table = name.replace(/\.ts$/, '');
			const module = (await import(`../../../../lib/collections/${table}.ts`)) as Record<
				string,
				unknown
			>;
			const exported = Object.keys(module);
			if (exported.length !== 1 || exported[0] !== table) offending.push(`${name}: ${exported}`);
		}

		expect(offending).toEqual([]);
	});

	it('builds nothing until a source is installed', async () => {
		const { own } = (await resolvers())[0] as { readonly own: Resolver };

		expect(() => own()).toThrow(/No collection source is installed/);
	});
});

describe('every collection, built', () => {
	beforeEach(() => {
		installMemoryCollections();
	});

	it('is named for its table and indexed on its primary key', async () => {
		for (const { own } of await resolvers()) {
			const collection = own();
			expect(collection.id).toBe(own.declaration.table);
			// The registry creates this one for every table, because a lazily loaded
			// join needs the join column indexed and every table is joined by `id`.
			expect(collection.indexes.size).toBeGreaterThan(0);
		}
	});

	it('answers with the same collection every time', async () => {
		// A live query dedupes by collection identity, and two collections over one
		// table would each open their own shape and disagree about what is in it.
		for (const { own } of await resolvers()) {
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

	it('lists every table this app syncs, under the mode the module declares', async () => {
		const eager = documented(2);
		const onDemand = documented(3);
		const wrong: string[] = [];

		for (const { own } of await resolvers()) {
			const { table, syncMode } = own.declaration;
			const listed = eager.has(table) ? 'eager' : onDemand.has(table) ? 'on-demand' : 'nowhere';
			if (listed !== syncMode) wrong.push(`${table}: declared ${syncMode}, documented ${listed}`);
		}

		expect(wrong).toEqual([]);
	});

	it('lists no table this app has no module for', async () => {
		const declared = new Set((await resolvers()).map(({ own }) => own.declaration.table));
		const orphaned = [...documented(2), ...documented(3)].filter((table) => !declared.has(table));

		expect(orphaned).toEqual([]);
	});
});
