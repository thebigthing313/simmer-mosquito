/**
 * The `application_batches` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { type ApplicationBatch, createApplicationBatchesCollection } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `on-demand`: One row per batch drawn down by a treatment.
 *
 * This app writes application_batches, so the collection carries the three
 * mutation handlers and every write through it names the command it means.
 */
export const application_batches = declareCollection<ApplicationBatch>({
	table: 'application_batches',
	syncMode: 'on-demand',
	mutations: true,
	create: createApplicationBatchesCollection,
});
