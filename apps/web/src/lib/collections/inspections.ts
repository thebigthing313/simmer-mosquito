/**
 * The `inspections` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createInspectionsCollection, type Inspection } from '@simmer-mosquito/sync';
import { BasicIndex } from '@tanstack/db';
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

	/*
	 * One index per column the inspections table sorts on.
	 *
	 * An `orderBy` with a `limit` pages lazily only while the first sort key is
	 * indexed here, and only while that index was built with the compare options
	 * the clause asks for. Miss either and the compiler warns once and then loads
	 * every inspection the organization has, with the right rows in the right
	 * order and nothing thrown. `INSPECTION_SORT_KEYS` in
	 * `hooks/queries/use-inspection-table.ts` is the other half of this list; a
	 * key added there without a column here is a silent full load, which is what
	 * the sort-key loop in that hook's suite catches.
	 */
	index: (collection) => {
		// The collection's own options with one change, rather than a copy of the
		// library's defaults. `nulls` is the only part the table decides.
		const sorted = {
			indexType: BasicIndex,
			options: { compareOptions: { ...collection.compareOptions, nulls: 'last' as const } },
		};
		collection.createIndex((row) => row.inspection_date, sorted);
		collection.createIndex((row) => row.is_wet, sorted);
		collection.createIndex((row) => row.dip_count, sorted);
		collection.createIndex((row) => row.larvae_count, sorted);
	},
});
