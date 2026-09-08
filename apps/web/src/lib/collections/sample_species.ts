/**
 * The `sample_species` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createSampleSpeciesCollection, type SampleSpecies } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `on-demand`: One row per species found in a sample, so it grows faster than the samples
 * do.
 *
 * This app writes sample_species, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 */
export const sample_species = declareCollection<SampleSpecies>({
	table: 'sample_species',
	syncMode: 'on-demand',
	mutations: true,
	create: createSampleSpeciesCollection,
});
