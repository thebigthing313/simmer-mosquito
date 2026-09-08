/**
 * The `habitat_types` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createHabitatTypesCollection, type HabitatType } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `eager`: The habitat catalogue, read by every habitat form, card and filter.
 *
 * This app writes habitat_types, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 */
export const habitat_types = declareCollection<HabitatType>({
	table: 'habitat_types',
	syncMode: 'eager',
	mutations: true,
	create: createHabitatTypesCollection,
});
