/**
 * The `route_items` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createRouteItemsCollection, type RouteItem } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `on-demand`: One row per stop on a route, and only the route being planned needs its own.
 *
 * This app writes route_items, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 */
export const route_items = declareCollection<RouteItem>({
	table: 'route_items',
	syncMode: 'on-demand',
	mutations: true,
	create: createRouteItemsCollection,
});
