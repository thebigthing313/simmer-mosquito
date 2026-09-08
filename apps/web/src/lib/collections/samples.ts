/**
 * The `samples` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createSamplesCollection, type Sample } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `on-demand`: One row per dip set taken during an inspection.
 *
 * This app writes samples, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 */
export const samples = declareCollection<Sample>({
	table: 'samples',
	syncMode: 'on-demand',
	mutations: true,
	create: createSamplesCollection,
});
