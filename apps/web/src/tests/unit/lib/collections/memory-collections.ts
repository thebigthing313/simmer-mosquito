/**
 * The second collection source: rows in memory, no server.
 *
 * `sync-source.ts` is the one the app installs. This is the one a test
 * installs, and having two is what makes the registry a seam rather than an
 * indirection. A test that wants to read through `useHabitat` installs this,
 * seeds the rows, and renders the hook; nothing opens a shape and nothing
 * needs a server URL.
 *
 * The collections are real TanStack DB collections rather than object stubs.
 * A stub would make every assertion be about a query the engine never ran:
 * joins, `orderBy`, `where` and the compiled `select` are the engine's work,
 * and they are the part of a read hook worth testing.
 *
 * Installing forgets what the last install built, so each test starts from
 * empty tables. Call it from a `beforeEach`.
 */

import { createCollection } from '@tanstack/db';
import { expect } from 'vitest';
import {
	type CollectionDeclaration,
	type CollectionOf,
	type CollectionResolver,
	installCollections,
	type SyncedRow,
} from '../../../../lib/collections/registry';

/** A row as a collection holds one: snake_case columns, keyed by `id`. */
export type MemoryRow = Record<string, unknown> & { readonly id: string };

/** What a collection's sync function is handed, narrowed to what a test drives. */
interface SyncControls {
	readonly begin: () => void;
	readonly write: (message: { readonly type: 'insert'; readonly value: MemoryRow }) => void;
	readonly commit: () => void;
	readonly markReady: () => void;
}

const open = new Map<string, SyncControls>();

export interface MemoryCollectionOptions {
	/**
	 * Whether a collection reports itself synced as soon as it is built.
	 *
	 * `true` by default, which is a table that has finished syncing and holds no
	 * rows. Pass `false` to hold every collection unsynced until
	 * {@link seedRows} or {@link markSynced}: that is the difference between "no
	 * rows" and "not yet", and a read hook that cannot tell a caller which of
	 * the two it is showing has an empty state that lies.
	 */
	readonly ready?: boolean;
}

/** Build every collection in memory from here on. */
export function installMemoryCollections(options: MemoryCollectionOptions = {}): void {
	const ready = options.ready ?? true;
	open.clear();
	installCollections({
		build: (declaration) => buildMemoryCollection(declaration, ready),
	});
}

function buildMemoryCollection<TRow extends SyncedRow>(
	declaration: CollectionDeclaration<TRow>,
	ready: boolean,
): CollectionOf<TRow> {
	const collection = createCollection<MemoryRow>({
		id: declaration.table,
		getKey: (row) => row.id,
		// Eagerly, so the controls are registered before a test seeds through them.
		startSync: true,
		sync: {
			sync: (controls) => {
				open.set(declaration.table, controls as unknown as SyncControls);
				if (ready) controls.markReady();
			},
		},

		// Spread rather than assigned, so a table this app only reads has no
		// handlers at all and refuses a write the way the real collection does.
		...(declaration.mutations
			? {
					onInsert: () => Promise.resolve(),
					onUpdate: () => Promise.resolve(),
					onDelete: () => Promise.resolve(),
				}
			: {}),
	});

	return collection as unknown as CollectionOf<TRow>;
}

/**
 * Put rows in a collection as though they had synced, and report it synced.
 *
 * Takes the module's resolver rather than a table name, so seeding a table
 * nothing imports is a compile error and the columns are checked against the
 * generated row schema. Seeding twice adds to what is there rather than
 * replacing it, which is what a shape does.
 */
export function seedRows<TRow extends SyncedRow>(
	collection: CollectionResolver<TRow>,
	rows: readonly MemoryRow[],
): void {
	const controls = controlsFor(collection);
	controls.begin();
	for (const row of rows) {
		controls.write({ type: 'insert', value: row });
	}
	controls.commit();
	controls.markReady();
}

/** Report a collection synced and empty, without seeding anything. */
export function markSynced<TRow extends SyncedRow>(collection: CollectionResolver<TRow>): void {
	controlsFor(collection).markReady();
}

/** Resolving is what registers the controls, so ask for the collection first. */
function controlsFor<TRow extends SyncedRow>(collection: CollectionResolver<TRow>): SyncControls {
	collection();
	const table = collection.declaration.table;
	const controls = open.get(table);
	expect(controls, `the ${table} collection was never resolved`).toBeDefined();
	return controls as SyncControls;
}
