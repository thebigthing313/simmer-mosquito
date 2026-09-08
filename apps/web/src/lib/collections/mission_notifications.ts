/**
 * The `mission_notifications` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import {
	createMissionNotificationsCollection,
	type MissionNotification,
} from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `on-demand`: One row per person told about one mission, so a season of
 * spraying produces more of these than of anything else in the domain. Only a
 * mission's own page and a registration's history read them.
 *
 * This app writes mission_notifications, so the collection carries the three
 * mutation handlers and every write through it names the command it means.
 * Generating them is not one of those writes: it creates a set rather than a
 * row, so it goes to `POST /commands/mission_notifications/generate` and arrives
 * back over Electric.
 */
export const mission_notifications = declareCollection<MissionNotification>({
	table: 'mission_notifications',
	syncMode: 'on-demand',
	mutations: true,
	create: createMissionNotificationsCollection,
});
