/**
 * The `mission_items` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createMissionItemsCollection, type MissionItem } from '@simmer-mosquito/sync';
import { BasicIndex } from '@tanstack/db';
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

	/*
	 * The join key an inner join on `missions` loads this table by.
	 *
	 * `useAssignedRequestIds` joins stops to their missions with `inner`, and
	 * the compiler drives an inner join from whichever side holds fewer rows in
	 * the browser and loads the other lazily by `mission_id = any(...)`. That
	 * lookup is taken only while the column is indexed; without one the compiler
	 * warns once and asks the shape for every stop the source predicate admits.
	 * `useMissionsForRequest` joins the same two tables and does not read this:
	 * its join is `left` since #1026, so the stops are always the driven side
	 * and the missions are fetched by their own `id`.
	 */
	index: (collection) => {
		collection.createIndex((row) => row.mission_id, { indexType: BasicIndex });
	},
});
