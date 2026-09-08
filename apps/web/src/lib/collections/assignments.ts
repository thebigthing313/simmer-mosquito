/**
 * The `assignments` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { type Assignment, createAssignmentsCollection } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `on-demand`: One row per crew per day, so it grows every day worked.
 *
 * This app writes assignments, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 */
export const assignments = declareCollection<Assignment>({
	table: 'assignments',
	syncMode: 'on-demand',
	mutations: true,
	create: createAssignmentsCollection,
});
