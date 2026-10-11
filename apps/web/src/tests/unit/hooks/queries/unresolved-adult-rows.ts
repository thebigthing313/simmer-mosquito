/**
 * A Trap and a Collection naming a method and a lure the client does not hold.
 *
 * Six adult surveillance reads join the collection method, and two join the
 * lure, each `left`. Every one owes the same answer when the id is set and the
 * joined row never arrives: the name reads `null`, never the `undefined` an
 * unmatched `left` join yields and never a stand-in label (#1535). The suites
 * over those hooks seed the same rows to ask, so the rows are built here once.
 */

import { collections } from '../../../../lib/collections/collections';
import { traps } from '../../../../lib/collections/traps';
import { seedRows } from '../../lib/collections/memory-collections';
import { GONE_METHOD } from './unresolved-performed-actions';

/** A lure the rows name and no collection holds. */
const GONE_LURE = '99999999-9999-4999-8999-999999999999';

/** The window bound and the zone that take the collection in. */
export const SINCE = '2026-08-01';
export const ZONE = 'UTC';

/**
 * Trap `t1` and collection `c1` on it, each naming {@link GONE_METHOD} and
 * {@link GONE_LURE}. The collection has no species rows and is not a zero
 * result, so it is awaiting identification. Call after `installMemoryCollections`.
 */
export function seedUnresolvedAdultRows(): void {
	seedRows(traps, [
		{
			id: 't1',
			trap_code: 'WS-1',
			trap_name: 'Willow Slough',
			description: null,
			is_active: true,
			collection_method_id: GONE_METHOD,
			collection_lure_id: GONE_LURE,
			address_id: null,
			lat: 38.5,
			lng: -121.7,
			geom_type: 'ST_Point',
		},
	]);
	seedRows(collections, [
		{
			id: 'c1',
			trap_id: 't1',
			collection_method_id: GONE_METHOD,
			collection_lure_id: GONE_LURE,
			address_id: null,
			collected_at: null,
			collection_date: '2026-08-04',
			collection_timing_mode: 'collection_date_duration',
			collected_by_profile_id: null,
			has_problem: false,
			is_zero_result: false,
			has_bycatch: false,
			lat: 38.5,
			lng: -121.7,
			geom_type: 'ST_Point',
		},
	]);
}

/** What a row's method reads when the join did not match. */
export const UNRESOLVED_METHOD = { methodId: GONE_METHOD, methodName: null } as const;

/** What a row's method and lure read when neither join matched. */
export const UNRESOLVED_METHOD_AND_LURE = {
	...UNRESOLVED_METHOD,
	lureId: GONE_LURE,
	lureName: null,
} as const;
