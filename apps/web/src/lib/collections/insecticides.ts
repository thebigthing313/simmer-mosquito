/**
 * The `insecticides` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createInsecticidesCollection, type Insecticide } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `eager`: The product catalogue, read by every application form and label lookup.
 *
 * This app writes insecticides, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 */
export const insecticides = declareCollection<Insecticide>({
	table: 'insecticides',
	syncMode: 'eager',
	mutations: true,
	create: createInsecticidesCollection,
});
