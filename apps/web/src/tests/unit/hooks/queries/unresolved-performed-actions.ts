/**
 * Performed control actions naming records the client does not hold.
 *
 * Nine hooks read a performed control action with its performer, method and
 * (for an application) insecticide joined, and each owes the same answer when
 * the id is set and the joined row never arrives: the name reads `null`, never
 * the `undefined` an unmatched `left` join yields and never a stand-in label.
 * That is how an action whose performer's Profile was deleted reads for good,
 * since the Profile shape streams `deleted_at is null` rows only (#874, #1501).
 * The suites over those hooks seed the same four rows to ask, so the rows are
 * built here once rather than in each of them.
 */

import { expect } from 'vitest';
import { applications } from '../../../../lib/collections/applications';
import { biocontrol_actions } from '../../../../lib/collections/biocontrol_actions';
import { outreach_actions } from '../../../../lib/collections/outreach_actions';
import { source_reductions } from '../../../../lib/collections/source_reductions';
import { seedRows } from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

/** Ids the rows name and no collection holds. */
export const GONE_PROFILE = '22222222-2222-4222-8222-222222222222';
export const GONE_METHOD = '55555555-5555-4555-8555-555555555555';
export const GONE_PRODUCT = '44444444-4444-4444-8444-444444444444';
export const GONE_VEHICLE = '77777777-7777-4777-8777-777777777777';
export const GONE_EQUIPMENT = '88888888-8888-4888-8888-888888888888';

/** The day every row was performed on, and the window bound that takes it in. */
export const DAY = '2026-08-04';

const CREATED_AT = new Date('2026-08-04T12:00:00Z');

/**
 * One row per performed action type, `a1`, `s1`, `b1` and `o1`, each naming a
 * performer and a method the client does not hold. The application names an
 * absent insecticide, vehicle and equipment as well. Call after
 * `installMemoryCollections`.
 */
export function seedUnresolvedActions(): void {
	seedRows(applications, [
		{
			id: 'a1',
			application_date: DAY,
			insecticide_id: GONE_PRODUCT,
			application_method_id: GONE_METHOD,
			applicator_profile_id: GONE_PROFILE,
			amount_applied: 12,
			application_unit_id: null,
			vehicle_id: GONE_VEHICLE,
			equipment_id: GONE_EQUIPMENT,
			created_at: CREATED_AT,
		},
	]);
	seedRows(source_reductions, [
		{
			id: 's1',
			source_reduction_date: DAY,
			source_reduction_method_id: GONE_METHOD,
			technician_profile_id: GONE_PROFILE,
			sources_eliminated_amount: 4,
			sources_eliminated_unit_id: null,
			created_at: CREATED_AT,
		},
	]);
	seedRows(biocontrol_actions, [
		{
			id: 'b1',
			biocontrol_date: DAY,
			biocontrol_method_id: GONE_METHOD,
			technician_profile_id: GONE_PROFILE,
			amount_released: 200,
			release_unit_id: null,
			created_at: CREATED_AT,
		},
	]);
	seedRows(outreach_actions, [
		{
			id: 'o1',
			outreach_date: DAY,
			outreach_method_id: GONE_METHOD,
			technician_profile_id: GONE_PROFILE,
			reach: 40,
			reach_description: null,
			created_at: CREATED_AT,
		},
	]);
}

/** Wait for a single-record hook to resolve, then hand back the record. */
export async function readRecord<TRecord>(
	hook: () => { readonly isReady: boolean; readonly record: TRecord | undefined },
): Promise<TRecord> {
	const { result } = await renderRead(hook);
	await expect.poll(() => result.current.isReady).toBe(true);
	const record = result.current.record;
	if (record === undefined) throw new Error('the record did not come back');
	return record;
}

/** Wait for a list hook to hold rows, then hand them back. */
export async function readList<TRow>(
	hook: () => { readonly isReady: boolean; readonly rows: readonly TRow[] },
): Promise<readonly TRow[]> {
	const { result } = await renderRead(hook);
	await expect.poll(() => result.current.isReady && result.current.rows.length > 0).toBe(true);
	return result.current.rows;
}

/** What a technician-performed action's names read when neither join matched. */
export const UNRESOLVED_TECHNICIAN_ACTION = {
	methodId: GONE_METHOD,
	methodName: null,
	technicianProfileId: GONE_PROFILE,
	technicianName: null,
} as const;
