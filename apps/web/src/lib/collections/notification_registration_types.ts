/**
 * The `notification_registration_types` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import {
	createNotificationRegistrationTypesCollection,
	type NotificationRegistrationType,
} from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `on-demand`: The link rows saying which notifications each registration wants.
 * One per registration per type, so it grows faster than the registrations do.
 *
 * This app writes notification_registration_types, so the collection carries the
 * three mutation handlers and every write through it names the command it means.
 */
export const notification_registration_types = declareCollection<NotificationRegistrationType>({
	table: 'notification_registration_types',
	syncMode: 'on-demand',
	mutations: true,
	create: createNotificationRegistrationTypesCollection,
});
