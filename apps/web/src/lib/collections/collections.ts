/**
 * The `collections` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { type AdultCollection, createCollectionsCollection } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `on-demand`: One row per trap visit, so it grows every week the season runs.
 *
 * This app writes collections, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 */
export const collections = declareCollection<AdultCollection>({
	table: 'collections',
	syncMode: 'on-demand',
	mutations: true,
	create: createCollectionsCollection,
});
