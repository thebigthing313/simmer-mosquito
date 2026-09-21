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
import { BasicIndex } from '@tanstack/db';
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

	/*
	 * The key a correlated include loads this table by.
	 *
	 * `useDayActivity` reads a day of records with each one's `additional_personnel` rows
	 * as a `toArray` subquery on `entity_id`, and the compiler loads that side
	 * by `entity_id = any(...)` over the parents it matched only while the
	 * column is indexed; without one it warns once and falls back to scanning
	 * local data, which for an on-demand table is whatever another surface
	 * happened to load.
	 */
	index: (collection) => {
		collection.createIndex((row) => row.entity_id, { indexType: BasicIndex });
	},
});
