/**
 * The `inspections` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createInspectionsCollection, type Inspection } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `on-demand`: One row per habitat visit, so it grows every week the season runs.
 *
 * This app writes inspections, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 */
export const inspections = declareCollection<Inspection>({
	table: 'inspections',
	syncMode: 'on-demand',
	mutations: true,
	create: createInspectionsCollection,
});
