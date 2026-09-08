/**
 * The `mission_items` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createMissionItemsCollection, type MissionItem } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `on-demand`: One row per stop on a mission, and only the mission on screen needs its own.
 *
 * This app writes mission_items, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 */
export const mission_items = declareCollection<MissionItem>({
	table: 'mission_items',
	syncMode: 'on-demand',
	mutations: true,
	create: createMissionItemsCollection,
});
