/**
 * The `units` collection.
 *
 * See `genera.ts` for why `syncMode`, `mutations` and the written-out type are
 * the app's decisions rather than the table's.
 */

import { createUnitsCollection, type Unit } from '@simmer-mosquito/sync';
import { BasicIndex, type Collection } from '@tanstack/db';
import { syncClientOptions } from './client-options';

/**
 * `eager`: a few dozen units, grouped by what they measure on the page that owns
 * them.
 *
 * `mutations: true` posts to `/commands/units`, which exists as of the same
 * change that wrote this file — until then units were the one global catalog with
 * no domain command at all, and the console wrote them through `/admin/units`.
 */
export const units: Collection<Unit, string | number> = createUnitsCollection({
	...syncClientOptions,
	syncMode: 'eager',
	mutations: true,
});

units.createIndex((row) => row.id, { indexType: BasicIndex });
