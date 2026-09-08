/**
 * The `routes` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createRoutesCollection, type Route } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `eager`: The route list. An organization has dozens, and the planner needs all of
 * them to arrange one.
 *
 * This app writes routes, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 */
export const routes = declareCollection<Route>({
	table: 'routes',
	syncMode: 'eager',
	mutations: true,
	create: createRoutesCollection,
});
