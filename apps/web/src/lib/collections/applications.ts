/**
 * The `applications` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { type Application, createApplicationsCollection } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `on-demand`: One row per treatment, so the explorers ask for a date window rather than
 * the season.
 *
 * This app writes applications, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 */
export const applications = declareCollection<Application>({
	table: 'applications',
	syncMode: 'on-demand',
	mutations: true,
	create: createApplicationsCollection,
});
