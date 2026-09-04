/**
 * The `traps` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createTrapsCollection, type Trap } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `eager`: A trap network is a fixed set an agency maintains, not a record that
 * accumulates — and the map draws all of them.
 *
 * This app writes traps, so the collection carries the three mutation handlers
 * and every write through it names the command it means.
 */
export const traps = declareCollection<Trap>({
	table: 'traps',
	syncMode: 'eager',
	mutations: true,
	create: createTrapsCollection,
});
