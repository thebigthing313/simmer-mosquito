/**
 * The `tag_items` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createTagItemsCollection, type TagItem } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `on-demand`: One row per tagged record, so it grows with every record there is.
 *
 * This app writes tag_items, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 */
export const tag_items = declareCollection<TagItem>({
	table: 'tag_items',
	syncMode: 'on-demand',
	mutations: true,
	create: createTagItemsCollection,
});
