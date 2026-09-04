/**
 * The `vehicles` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createVehiclesCollection, type Vehicle } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `eager`: An agency's fleet. A short list, offered on every application and
 * assignment.
 *
 * This app writes vehicles, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 */
export const vehicles = declareCollection<Vehicle>({
	table: 'vehicles',
	syncMode: 'eager',
	mutations: true,
	create: createVehiclesCollection,
});
