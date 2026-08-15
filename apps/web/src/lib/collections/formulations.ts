/**
 * The `formulations` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createFormulationsCollection, type Formulation } from '@simmer-mosquito/sync';
import type { Collection } from '@tanstack/db';
import { getServerUrl } from '../../auth';

/**
 * `eager`: The formulation catalogue, read wherever a product is chosen.
 *
 * This app writes formulations, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 *
 * The type is written here rather than inferred because a `Collection<…>`
 * instantiated inside `packages/sync` arrives as `any`, with no error to say so.
 * Naming it on this side instantiates it where it resolves.
 */
export const formulations: Collection<Formulation, string | number> = createFormulationsCollection({
	serverUrl: getServerUrl(),
	syncMode: 'eager',
	mutations: true,
});
