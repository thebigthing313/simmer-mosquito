/**
 * The `species` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createSpeciesCollection, type Species } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `eager`: The global taxonomy. Small, and read by every species picker and count
 * entry.
 *
 * Read-only here. Declaring it leaves the collection with no
 * `onInsert`/`onUpdate`/`onDelete` at all, so a write is refused before it
 * travels.
 */
export const species = declareCollection<Species>({
	table: 'species',
	syncMode: 'eager',
	mutations: false,
	create: createSpeciesCollection,
});
