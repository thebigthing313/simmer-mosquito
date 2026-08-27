/**
 * The `species` collection.
 *
 * See `genera.ts` for why `syncMode`, `mutations` and the written-out type are
 * the app's decisions rather than the table's.
 */

import { createSpeciesCollection, type Species } from '@simmer-mosquito/sync';
import { BasicIndex, type Collection } from '@tanstack/db';
import { syncClientOptions } from './client-options';

/**
 * `eager`: every species, listed in full on the page that owns them and counted
 * per genus on the page beside it.
 *
 * `mutations: true` posts to `/commands/species`.
 */
export const species: Collection<Species, string | number> = createSpeciesCollection({
	...syncClientOptions,
	syncMode: 'eager',
	mutations: true,
});

species.createIndex((row) => row.id, { indexType: BasicIndex });

/**
 * The second index, which `genera.ts` does not need.
 *
 * The genus roster counts species per genus and the species roster joins each
 * row to its genus, so `genus_id` is a join key here as well as `id`. Both sides
 * of a join want an index; only the driving side would work without one.
 */
species.createIndex((row) => row.genus_id, { indexType: BasicIndex });
