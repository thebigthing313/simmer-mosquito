/**
 * The `region_folders` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createRegionFoldersCollection, type RegionFolder } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `eager`: The tree the region picker draws. It has to be whole to draw at all.
 *
 * This app writes region_folders, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 */
export const region_folders = declareCollection<RegionFolder>({
	table: 'region_folders',
	syncMode: 'eager',
	mutations: true,
	create: createRegionFoldersCollection,
});
