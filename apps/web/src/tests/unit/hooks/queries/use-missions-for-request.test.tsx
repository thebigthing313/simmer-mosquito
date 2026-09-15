/** @vitest-environment jsdom */

/**
 * The missions a request has been scheduled onto.
 *
 * Two cases hold what the request page shows: the list is the missions whose
 * stops name the request, newest scheduled first, and a stop whose mission has
 * not streamed is left off rather than drawn blank. The third is the pushdown
 * (#1026): both tables are on-demand, and the `inner` join this used to make
 * picked its lazy side by which collection held fewer rows in the browser, so
 * on a cold page the `missions` subset went out with no predicate and the
 * Organization's whole table streamed to draw a card that lists two rows. The
 * predicate strings are asserted whole, so the join running backwards again
 * fails on the string rather than on a page.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useMissionsForRequest } from '../../../../hooks/queries/use-missions-for-request';
import { mission_items } from '../../../../lib/collections/mission_items';
import { missions } from '../../../../lib/collections/missions';
import {
	installMemoryCollections,
	seedRows,
	subsetPredicate,
	subsetRequests,
} from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

const REQUEST = 'r1';

function mission(id: string, scheduledStartAt: string) {
	return {
		id,
		mission_name: `Mission ${id}`,
		control_type: 'larvicide',
		planned_method_id: null,
		assigned_to_profile_id: null,
		scheduled_start_at: new Date(scheduledStartAt),
		started_at: null,
		completed_at: null,
		cancelled_at: null,
	};
}

function stop(id: string, missionId: string, requestId: string | null) {
	return {
		id,
		mission_id: missionId,
		requested_control_action_id: requestId,
		position: 1,
		completed_at: null,
		skipped_at: null,
	};
}

describe('useMissionsForRequest', () => {
	beforeEach(() => {
		installMemoryCollections({ recordSubsets: true });
	});

	it('lists the missions whose stops name the request, newest scheduled first', async () => {
		seedRows(missions, [
			mission('m-early', '2026-09-10T13:00:00Z'),
			mission('m-late', '2026-09-20T13:00:00Z'),
			mission('m-middle', '2026-09-15T13:00:00Z'),
			mission('m-other', '2026-09-25T13:00:00Z'),
		]);
		seedRows(mission_items, [
			stop('s1', 'm-early', REQUEST),
			stop('s2', 'm-late', REQUEST),
			stop('s3', 'm-middle', REQUEST),
			stop('s4', 'm-other', 'r-other'),
			stop('s5', 'm-other', null),
		]);

		const { result } = await renderRead(() => useMissionsForRequest(REQUEST));

		expect(result.current.isReady).toBe(true);
		expect(result.current.missions.map((row) => row.id)).toEqual(['m-late', 'm-middle', 'm-early']);
		expect(result.current.missions.map((row) => row.status)).toEqual([
			'scheduled',
			'scheduled',
			'scheduled',
		]);
	});

	it('leaves a stop whose mission has not streamed off the list', async () => {
		seedRows(mission_items, [stop('s1', 'missing-mission', REQUEST)]);

		const { result } = await renderRead(() => useMissionsForRequest(REQUEST));

		expect(result.current.missions).toEqual([]);
	});

	it('asks the missions shape for the linked mission ids and nothing else', async () => {
		seedRows(missions, [
			mission('m1', '2026-09-20T13:00:00Z'),
			mission('m2', '2026-09-10T13:00:00Z'),
		]);
		seedRows(mission_items, [stop('s1', 'm1', REQUEST), stop('s2', 'm2', REQUEST)]);

		await renderRead(() => useMissionsForRequest(REQUEST));

		const stopPredicates = subsetRequests(mission_items).map(subsetPredicate);
		const missionPredicates = subsetRequests(missions).map(subsetPredicate);
		expect(stopPredicates).toEqual([`requested_control_action_id = ${REQUEST}`]);
		expect(missionPredicates).toEqual(['id = ANY [m1, m2]']);
	});
});
