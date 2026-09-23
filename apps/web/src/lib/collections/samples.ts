/**
 * The `samples` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createSamplesCollection, type Sample } from '@simmer-mosquito/sync';
import { BasicIndex } from '@tanstack/db';
import { declareCollection } from './registry';

/**
 * `on-demand`: One row per dip set taken during an inspection.
 *
 * This app writes samples, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 */
export const samples = declareCollection<Sample>({
	table: 'samples',
	syncMode: 'on-demand',
	mutations: true,
	create: createSamplesCollection,

	/*
	 * The key a correlated include loads this table by.
	 *
	 * `useActivityStrip` reads a fortnight of inspections with each one's sample
	 * ids as a `toArray` subquery on `inspection_id`, and the compiler loads
	 * that side by `inspection_id = any(...)` over the parents it matched only
	 * while the column is indexed; without one it warns once and falls back to
	 * scanning local data, which for an on-demand table is whatever another
	 * surface happened to load, so the count reads low with nothing saying why.
	 */
	index: (collection) => {
		collection.createIndex((row) => row.inspection_id, { indexType: BasicIndex });
	},
});
