/** @vitest-environment jsdom */

/**
 * The set behind the requests explorer's `unassigned` filter.
 *
 * `CONTEXT.md` says a request is assigned while a live stop on a scheduled or
 * in-progress mission names it, so the cases are the four mission states and
 * a stop that names no request. The last case is the pushdown: both tables are
 * on-demand, and a predicate that reaches neither shape is one the browser
 * applies to every stop the Organization has ever written.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useAssignedRequestIds } from '../../../../hooks/queries/use-assigned-request-ids';
import { mission_items } from '../../../../lib/collections/mission_items';
import { missions } from '../../../../lib/collections/missions';
import {
	installMemoryCollections,
	seedRows,
	subsetPredicate,
	subsetRequests,
} from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

const SCHEDULED = '2026-09-20T13:00:00Z';

function mission(
	id: string,
	overrides: {
		readonly started_at?: Date | null;
		readonly completed_at?: Date | null;
		readonly cancelled_at?: Date | null;
	} = {},
) {
	return {
		id,
		mission_name: `Mission ${id}`,
		control_type: 'larvicide',
		scheduled_start_at: new Date(SCHEDULED),
		started_at: null,
		completed_at: null,
		cancelled_at: null,
		...overrides,
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

describe('useAssignedRequestIds', () => {
	beforeEach(() => {
		installMemoryCollections({ recordSubsets: true });
	});

	it('counts a stop on a scheduled or in-progress mission and not on a finished one', async () => {
		seedRows(missions, [
			mission('scheduled'),
			mission('in-progress', { started_at: new Date('2026-09-15T08:00:00Z') }),
			mission('completed', {
				started_at: new Date('2026-09-14T08:00:00Z'),
				completed_at: new Date('2026-09-14T12:00:00Z'),
			}),
			mission('cancelled', { cancelled_at: new Date('2026-09-14T12:00:00Z') }),
		]);
		seedRows(mission_items, [
			stop('s1', 'scheduled', 'r-scheduled'),
			stop('s2', 'in-progress', 'r-in-progress'),
			stop('s3', 'completed', 'r-completed'),
			stop('s4', 'cancelled', 'r-cancelled'),
			stop('s5', 'scheduled', null),
		]);

		const { result } = await renderRead(() => useAssignedRequestIds());

		expect([...result.current.assignedRequestIds].sort()).toEqual(['r-in-progress', 'r-scheduled']);
		expect(result.current.isReady).toBe(true);
	});

	it('leaves a stop whose mission has not streamed off the set', async () => {
		seedRows(mission_items, [stop('s1', 'missing-mission', 'r1')]);

		const { result } = await renderRead(() => useAssignedRequestIds());

		expect(result.current.assignedRequestIds.size).toBe(0);
	});

	it('narrows both shapes rather than reading every stop and every mission', async () => {
		seedRows(missions, [mission('m1')]);
		seedRows(mission_items, [stop('s1', 'm1', 'r1')]);

		await renderRead(() => useAssignedRequestIds());

		const stopPredicates = subsetRequests(mission_items).map(subsetPredicate);
		const missionPredicates = subsetRequests(missions).map(subsetPredicate);
		expect(
			stopPredicates.some((predicate) =>
				predicate.includes('NOT (requested_control_action_id IS NULL)'),
			),
		).toBe(true);
		expect(
			missionPredicates.some(
				(predicate) =>
					predicate.includes('completed_at IS NULL') && predicate.includes('cancelled_at IS NULL'),
			),
		).toBe(true);
	});
});
