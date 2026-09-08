/**
 * Where a hook gets a collection.
 *
 * Each module in this folder used to call its factory at module scope, so the
 * collection existed the moment anything imported the module. A hook cannot be
 * imported without its collections, and a collection cannot be built without a
 * server URL and an Electric shape route, so importing a read hook was a
 * network decision. That is what kept `apps/web` from testing a read at all:
 * the only way to reach `useHabitat` was to build the real `habitats`
 * collection first.
 *
 * So a module now *declares* its collection and this resolves it on the first
 * call. `apps/web` installs the sync-backed source in `main.tsx`; a test
 * installs a memory-backed one. Importing a hook builds nothing and asks for
 * nothing.
 *
 * ## What this does not decide
 *
 * `syncMode` and `mutations` stay where they were, in the table's own module,
 * with the reasoning beside them. ADR 0007 keeps the shared sync package free
 * of prebuilt collections and ADR 0014 records the app choosing the mode per
 * module; a registry that answered either question would be that singleton
 * under another name. This changes who *resolves* a collection, not who chooses
 * what it is.
 *
 * The declaration carries both as data rather than baking them into `create`,
 * which is what lets a source read them: the memory source gives a read-only
 * table no write handlers, so a test refuses the write a real client would.
 */

import type { CollectionSyncMode, SyncCollectionClientOptions } from '@simmer-mosquito/sync';
import { BasicIndex, type Collection } from '@tanstack/db';

/**
 * Every synced table has a `uuid` primary key named `id`, so every row this
 * folder holds has one. `syncCollectionConfig` in `packages/sync` states the
 * same thing for the same reason.
 */
export interface SyncedRow {
	readonly id: string;
}

/**
 * A collection of `TRow`.
 *
 * The key is `string | number` because that is what TanStack DB widens a
 * `getKey` returning a string to.
 */
export type CollectionOf<TRow extends SyncedRow> = Collection<TRow, string | number>;

/** What a table module says about its collection without building one. */
export interface CollectionDeclaration<TRow extends SyncedRow> {
	/** The Postgres table. Names the collection and derives both its routes. */
	readonly table: string;
	/** See `docs/sync.md` for the matrix these add up to. */
	readonly syncMode: CollectionSyncMode;
	/** Whether this app may write to the table. */
	readonly mutations: boolean;
	/**
	 * The generated factory from `packages/sync`, passed rather than called.
	 *
	 * A module names the factory and nothing else, so it has no options to
	 * assemble and no way to reach for a server URL of its own. The sweep that
	 * read all fifty modules as text looking for one that had is gone with it.
	 */
	readonly create: (options: SyncCollectionClientOptions) => CollectionOf<TRow>;
	/**
	 * Indexes beyond the primary key, for the columns a picker filters on.
	 *
	 * The `id` index is not here: {@link resolve} creates it for every table,
	 * because a live query that joins a table loads it lazily only when the join
	 * column is indexed, and every table is joined by its primary key. Without
	 * it the compiler logs a warning and loads the whole table, which on an
	 * on-demand collection is the one thing the mode exists to avoid.
	 */
	readonly index?: (collection: CollectionOf<TRow>) => void;
}

/**
 * What a module exports: call it to get the collection.
 *
 * The declaration rides along so a test can read what a table asked for
 * without building it.
 */
export type CollectionResolver<TRow extends SyncedRow> = (() => CollectionOf<TRow>) & {
	readonly declaration: CollectionDeclaration<TRow>;
};

/** How a declaration becomes a collection. Two of these exist: sync, and memory. */
export interface CollectionSource {
	readonly build: <TRow extends SyncedRow>(
		declaration: CollectionDeclaration<TRow>,
	) => CollectionOf<TRow>;
}

let source: CollectionSource | null = null;

/**
 * The collections built so far, keyed by table rather than by declaration.
 *
 * Resolving twice has to return the same object: a live query dedupes by
 * collection identity, and two collections over one table would each open their
 * own shape and disagree about what is in it.
 *
 * By table, because in development Vite re-executes an edited module and hands
 * back a new declaration for the same table. Keying on the declaration would
 * build a second collection for it, which is the thing this exists to prevent.
 * That a table has one module is checked statically, in
 * `collection-modules.test.ts`.
 */
let built = new Map<string, unknown>();

/**
 * Choose how collections are built from here on.
 *
 * Called once by `main.tsx` before the first render, and once per test file
 * that reads through a collection. Installing forgets what the previous source
 * built, so a test starts from empty tables rather than from the last one's
 * rows.
 */
export function installCollections(next: CollectionSource): void {
	source = next;
	built = new Map();
}

/**
 * Declare a table's collection. Building it is the installed source's job.
 *
 * Pass the row type explicitly. A `Collection<…>` instantiated inside
 * `packages/sync` arrives as `any` with no error to say so, so inference from
 * `create` would leave every column on every read hook untyped.
 */
export function declareCollection<TRow extends SyncedRow>(
	declaration: CollectionDeclaration<TRow>,
): CollectionResolver<TRow> {
	return Object.assign(() => resolve(declaration), { declaration });
}

function resolve<TRow extends SyncedRow>(
	declaration: CollectionDeclaration<TRow>,
): CollectionOf<TRow> {
	if (source === null) {
		throw new Error(
			`No collection source is installed, so the ${declaration.table} collection cannot be built. ` +
				'The app installs one in main.tsx; a test installs the memory source.',
		);
	}

	const existing = built.get(declaration.table);
	if (existing !== undefined) return existing as CollectionOf<TRow>;

	const collection = source.build(declaration);
	collection.createIndex((row) => row.id, { indexType: BasicIndex });
	declaration.index?.(collection);
	built.set(declaration.table, collection);
	return collection;
}
