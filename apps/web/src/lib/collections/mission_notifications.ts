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
import { BasicIndex, type Collection } from '@tanstack/db';
import { syncClientOptions } from './client-options';

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
 *
 * The type is written here rather than inferred because a `Collection<…>`
 * instantiated inside `packages/sync` arrives as `any`, with no error to say so.
 * Naming it on this side instantiates it where it resolves.
 */
export const mission_notifications: Collection<MissionNotification, string | number> =
	createMissionNotificationsCollection({
		...syncClientOptions,
		syncMode: 'on-demand',
		mutations: true,
	});

/**
 * The join index.
 *
 * A live query that joins this table loads it lazily — it collects the join keys
 * the driving side produces and asks for exactly those rows. It can only do that
 * when the join column is indexed. Without this it says so in a console warning
 * and loads the whole table instead, which on an on-demand collection is the one
 * thing the mode exists to avoid.
 *
 * Always `id`: every table is joined by its primary key, because that is what the
 * foreign keys point at.
 */
mission_notifications.createIndex((row) => row.id, { indexType: BasicIndex });
