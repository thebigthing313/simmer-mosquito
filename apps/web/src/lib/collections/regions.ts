/**
 * The `regions` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createRegionsCollection, type Region } from '@simmer-mosquito/sync';
import { BasicIndex } from '@tanstack/db';
import { declareCollection } from './registry';

/**
 * `on-demand`: Boundaries are large and numerous; the map and the region filter ask for the
 * ones in view.
 *
 * This app writes regions, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 */
export const regions = declareCollection<Region>({
	table: 'regions',
	syncMode: 'on-demand',
	mutations: true,
	create: createRegionsCollection,

	// The region boundary picker on the habitat and region forms.
	index: (collection) => {
		collection.createIndex((row) => row.name, { indexType: BasicIndex });
	},
});
