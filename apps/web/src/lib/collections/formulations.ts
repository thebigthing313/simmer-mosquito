/**
 * The `formulations` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createFormulationsCollection, type Formulation } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `eager`: The formulation catalogue, read wherever a product is chosen.
 *
 * This app writes formulations, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 */
export const formulations = declareCollection<Formulation>({
	table: 'formulations',
	syncMode: 'eager',
	mutations: true,
	create: createFormulationsCollection,
});
