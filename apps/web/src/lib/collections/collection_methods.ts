/**
 * The `collection_methods` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { type CollectionMethod, createCollectionMethodsCollection } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `eager`: A catalogue an organization has dozens of rows of, read by every
 * trap and collection screen.
 *
 * This app writes collection_methods, so the collection carries the three
 * mutation handlers and every write through it names the command it means.
 */
export const collection_methods = declareCollection<CollectionMethod>({
	table: 'collection_methods',
	syncMode: 'eager',
	mutations: true,
	create: createCollectionMethodsCollection,
});
