/**
 * The `tags` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createTagsCollection, type Tag } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `eager`: The label vocabulary. A few dozen rows, offered on every record that can
 * carry one.
 *
 * This app writes tags, so the collection carries the three mutation handlers
 * and every write through it names the command it means.
 */
export const tags = declareCollection<Tag>({
	table: 'tags',
	syncMode: 'eager',
	mutations: true,
	create: createTagsCollection,
});
