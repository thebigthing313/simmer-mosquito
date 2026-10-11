/**
 * The `collection_species` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { type CollectionSpecies, createCollectionSpeciesCollection } from '@simmer-mosquito/sync';
import { BasicIndex } from '@tanstack/db';
import { declareCollection } from './registry';

/**
 * `on-demand`: One row per species counted in a collection, so it grows faster than the
 * collections do.
 *
 * This app writes collection_species, so the collection carries the three
 * mutation handlers and every write through it names the command it means.
 */
export const collection_species = declareCollection<CollectionSpecies>({
	table: 'collection_species',
	syncMode: 'on-demand',
	mutations: true,
	create: createCollectionSpeciesCollection,

	/*
	 * The key a correlated include loads this table by. `useTrapCollections`
	 * and the two identification queues read each collection's species counts
	 * as a `toArray` subquery on `collection_id`.
	 */
	index: (collection) => {
		collection.createIndex((row) => row.collection_id, { indexType: BasicIndex });
	},
});
