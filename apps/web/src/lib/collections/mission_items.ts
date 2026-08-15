/**
 * The `mission_items` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createMissionItemsCollection, type MissionItem } from '@simmer-mosquito/sync';
import type { Collection } from '@tanstack/db';
import { getServerUrl } from '../../auth';

/**
 * `on-demand`: One row per stop on a mission, and only the mission on screen needs its own.
 *
 * This app writes mission_items, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 *
 * The type is written here rather than inferred because a `Collection<…>`
 * instantiated inside `packages/sync` arrives as `any`, with no error to say so.
 * Naming it on this side instantiates it where it resolves.
 */
export const mission_items: Collection<MissionItem, string | number> = createMissionItemsCollection(
	{
		serverUrl: getServerUrl(),
		syncMode: 'on-demand',
		mutations: true,
	},
);
