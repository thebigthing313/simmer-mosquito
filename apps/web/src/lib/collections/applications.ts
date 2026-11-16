/**
 * The `applications` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { type Application, createApplicationsCollection } from '@simmer-mosquito/sync';
import { BasicIndex } from '@tanstack/db';
import { declareCollection } from './registry';

/**
 * `on-demand`: One row per Chemical Application, the line under a Treatment
 * that names one Insecticide and its amount. A line has no date, place or
 * person of its own, so a read reaches it only through its Treatment.
 *
 * This app writes applications, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 */
export const applications = declareCollection<Application>({
	table: 'applications',
	syncMode: 'on-demand',
	mutations: true,
	create: createApplicationsCollection,

	/*
	 * The key every read loads this table by.
	 *
	 * A reader queries `treatments` and pulls each one's lines as a `toArray`
	 * subquery on `treatment_id`, and the compiler loads that side by
	 * `treatment_id = any(...)` over the Treatments it matched only while the
	 * column is indexed. Without the index it warns once and scans local data,
	 * which for an on-demand table is whatever another surface happened to load,
	 * so a Treatment reads as holding no products with nothing saying why.
	 */
	index: (collection) => {
		collection.createIndex((row) => row.treatment_id, { indexType: BasicIndex });
	},
});
