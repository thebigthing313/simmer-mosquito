/**
 * The `additional_personnel` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import {
	type AdditionalPersonnel,
	createAdditionalPersonnelCollection,
} from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `on-demand`: One row per extra crew member on an assignment.
 *
 * This app writes additional_personnel, so the collection carries the three
 * mutation handlers and every write through it names the command it means.
 */
export const additional_personnel = declareCollection<AdditionalPersonnel>({
	table: 'additional_personnel',
	syncMode: 'on-demand',
	mutations: true,
	create: createAdditionalPersonnelCollection,
});
