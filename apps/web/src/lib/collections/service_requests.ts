/**
 * The `service_requests` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createServiceRequestsCollection, type ServiceRequest } from '@simmer-mosquito/sync';
import { BasicIndex } from '@tanstack/db';
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

	/*
	 * One index per column the service requests table sorts on, for the reason
	 * `inspections.ts` gives: without one built with the clause's compare
	 * options, an `orderBy` with a `limit` loads every request the Organization
	 * has. `SERVICE_REQUEST_SORT_KEYS` in `hooks/queries/use-service-request-table.ts`
	 * is the other half of this list, and that hook's suite checks the two agree.
	 */
	index: (collection) => {
		const sorted = {
			indexType: BasicIndex,
			options: { compareOptions: { ...collection.compareOptions, nulls: 'last' as const } },
		};
		collection.createIndex((row) => row.request_date, sorted);
		collection.createIndex((row) => row.display_name, sorted);
	},
});
