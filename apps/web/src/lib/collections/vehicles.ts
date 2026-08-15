/**
 * The `vehicles` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createVehiclesCollection, type Vehicle } from '@simmer-mosquito/sync';
import type { Collection } from '@tanstack/db';
import { getServerUrl } from '../../auth';

/**
 * `eager`: An agency's fleet. A short list, offered on every application and
 * assignment.
 *
 * This app writes vehicles, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 *
 * The type is written here rather than inferred because a `Collection<…>`
 * instantiated inside `packages/sync` arrives as `any`, with no error to say so.
 * Naming it on this side instantiates it where it resolves.
 */
export const vehicles: Collection<Vehicle, string | number> = createVehiclesCollection({
	serverUrl: getServerUrl(),
	syncMode: 'eager',
	mutations: true,
});
