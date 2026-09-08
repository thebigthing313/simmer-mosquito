/**
 * The `notification_types` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createNotificationTypesCollection, type NotificationType } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `eager`: The notification catalogue an organization offers. A short list,
 * read by every registration form.
 *
 * This app writes notification_types, so the collection carries the three
 * mutation handlers and every write through it names the command it means.
 */
export const notification_types = declareCollection<NotificationType>({
	table: 'notification_types',
	syncMode: 'eager',
	mutations: true,
	create: createNotificationTypesCollection,
});
