/**
 * The `notification_registrations` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import {
	createNotificationRegistrationsCollection,
	type NotificationRegistration,
} from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `on-demand`: One row per place somebody asked to be warned about, so it grows
 * with the public rather than with the organization, and only the registrations
 * pages read it.
 *
 * This app writes notification_registrations, so the collection carries the
 * three mutation handlers and every write through it names the command it means.
 */
export const notification_registrations = declareCollection<NotificationRegistration>({
	table: 'notification_registrations',
	syncMode: 'on-demand',
	mutations: true,
	create: createNotificationRegistrationsCollection,
});
