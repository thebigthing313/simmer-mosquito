/**
 * The `insecticide_batches` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createInsecticideBatchesCollection, type InsecticideBatch } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `on-demand`: One row per batch received, so it accumulates over seasons.
 *
 * This app writes insecticide_batches, so the collection carries the three
 * mutation handlers and every write through it names the command it means.
 */
export const insecticide_batches = declareCollection<InsecticideBatch>({
	table: 'insecticide_batches',
	syncMode: 'on-demand',
	mutations: true,
	create: createInsecticideBatchesCollection,
});
