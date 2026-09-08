/**
 * The `formulation_insecticides` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import {
	createFormulationInsecticidesCollection,
	type FormulationInsecticide,
} from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `eager`: What each formulation contains. Read with the formulations, and about as
 * small.
 *
 * This app writes formulation_insecticides, so the collection carries the
 * three mutation handlers and every write through it names the command it
 * means.
 */
export const formulation_insecticides = declareCollection<FormulationInsecticide>({
	table: 'formulation_insecticides',
	syncMode: 'eager',
	mutations: true,
	create: createFormulationInsecticidesCollection,
});
