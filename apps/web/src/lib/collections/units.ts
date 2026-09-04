/**
 * The `units` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createUnitsCollection, type Unit } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `eager`: The measurements everything is recorded in. Read wherever a quantity is
 * shown.
 *
 * Read-only here. Declaring it leaves the collection with no
 * `onInsert`/`onUpdate`/`onDelete` at all, so a write is refused before it
 * travels.
 */
export const units = declareCollection<Unit>({
	table: 'units',
	syncMode: 'eager',
	mutations: false,
	create: createUnitsCollection,
});
