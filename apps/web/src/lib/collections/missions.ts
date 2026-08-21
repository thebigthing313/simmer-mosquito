/**
 * The `missions` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createMissionsCollection, type Mission } from '@simmer-mosquito/sync';
import { BasicIndex, type Collection } from '@tanstack/db';
import { syncClientOptions } from './client-options';

/**
 * `on-demand`: One row per dispatched mission, so it grows every day worked.
 *
 * This app writes missions, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 *
 * The type is written here rather than inferred because a `Collection<…>`
 * instantiated inside `packages/sync` arrives as `any`, with no error to say so.
 * Naming it on this side instantiates it where it resolves.
 */
export const missions: Collection<Mission, string | number> = createMissionsCollection({
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
missions.createIndex((row) => row.id, { indexType: BasicIndex });
