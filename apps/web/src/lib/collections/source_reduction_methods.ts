/**
 * The `source_reduction_methods` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import {
	createSourceReductionMethodsCollection,
	type SourceReductionMethod,
} from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `eager`: A method catalogue an agency has dozens of rows of.
 *
 * This app writes source_reduction_methods, so the collection carries the
 * three mutation handlers and every write through it names the command it
 * means.
 */
export const source_reduction_methods = declareCollection<SourceReductionMethod>({
	table: 'source_reduction_methods',
	syncMode: 'eager',
	mutations: true,
	create: createSourceReductionMethodsCollection,
});
