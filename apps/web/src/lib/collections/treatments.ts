/**
 * The `treatments` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createTreatmentsCollection, type Treatment } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `on-demand`: One row per visit's insecticide work, so a read asks for a date
 * window, a habitat or an inspection rather than the season. Each Treatment's
 * products are its `applications` lines, which a read pulls through a
 * correlated include on `applications.treatment_id` (ADR 0020).
 *
 * This app writes Treatments, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 */
export const treatments = declareCollection<Treatment>({
	table: 'treatments',
	syncMode: 'on-demand',
	mutations: true,
	create: createTreatmentsCollection,
});
