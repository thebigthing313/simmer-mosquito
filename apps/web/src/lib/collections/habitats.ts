/**
 * The `habitats` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createHabitatsCollection, type Habitat } from '@simmer-mosquito/sync';
import { BasicIndex } from '@tanstack/db';
import { declareCollection } from './registry';

/**
 * `on-demand`: An agency's habitats grow without bound, so live queries fetch the subsets
 * they ask for rather than the table streaming whole before first paint.
 *
 * This app writes habitats, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 */
export const habitats = declareCollection<Habitat>({
	table: 'habitats',
	syncMode: 'on-demand',
	mutations: true,
	create: createHabitatsCollection,

	// The habitat pickers on the control-action and inspection forms.
	index: (collection) => {
		collection.createIndex((row) => row.habitat_name, { indexType: BasicIndex });
	},
});
