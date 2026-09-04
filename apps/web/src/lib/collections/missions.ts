/**
 * The `missions` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createMissionsCollection, type Mission } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `on-demand`: One row per dispatched mission, so it grows every day worked.
 *
 * This app writes missions, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 */
export const missions = declareCollection<Mission>({
	table: 'missions',
	syncMode: 'on-demand',
	mutations: true,
	create: createMissionsCollection,
});
