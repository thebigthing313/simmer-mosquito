/**
 * The `service_requests` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createServiceRequestsCollection, type ServiceRequest } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `on-demand`: One row per request received, so it grows every day the phone rings.
 *
 * This app writes service_requests, so the collection carries the three
 * mutation handlers and every write through it names the command it means.
 */
export const service_requests = declareCollection<ServiceRequest>({
	table: 'service_requests',
	syncMode: 'on-demand',
	mutations: true,
	create: createServiceRequestsCollection,
});
