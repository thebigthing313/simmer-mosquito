/** @vitest-environment jsdom */

/**
 * The four Dashboard queues that read Electric, one suite because they answer
 * one shape and the page draws them through one row component. Each case is a
 * state the queue's predicate names, and the last block is the pushdown: every
 * table here is on-demand, and a predicate the browser applies after the fact
 * is a subset of every row the Organization has ever written.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useDueMissionsQueue } from '../../../../hooks/queries/use-due-missions-queue';
import { useInProgressAssignmentsQueue } from '../../../../hooks/queries/use-in-progress-assignments-queue';
import { useOpenServiceRequestsQueue } from '../../../../hooks/queries/use-open-service-requests-queue';
import { useProblemCollectionsQueue } from '../../../../hooks/queries/use-problem-collections-queue';
import { assignment_items } from '../../../../lib/collections/assignment_items';
import { assignments } from '../../../../lib/collections/assignments';
import { collections } from '../../../../lib/collections/collections';
import { missions } from '../../../../lib/collections/missions';
import { service_requests } from '../../../../lib/collections/service_requests';
import {
	installMemoryCollections,
	seedRows,
	subsetPredicate,
	subsetRequests,
} from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

const TODAY = '2026-09-15';
/** Five hours behind UTC in September, so an instant and its day can disagree. */
const TIME_ZONE = 'America/New_York';

function collection(
	id: string,
	overrides: {
		readonly collected_at?: Date | null;
		readonly collection_date?: string | null;
		readonly has_problem?: boolean;
	} = {},
) {
	return {
		id,
		trap_id: 't1',
		collection_method_id: 'm1',
		collected_at: null,
		collection_date: null,
		collection_timing_mode: 'collection_date_duration',
		has_problem: true,
		is_zero_result: false,
		has_bycatch: false,
		...overrides,
	};
}

beforeEach(() => {
	installMemoryCollections({ recordSubsets: true });
});

describe('useProblemCollectionsQueue', () => {
	it('counts problems in the last 14 days on either date column, oldest first', async () => {
		seedRows(collections, [
			// 2026-09-02 is the first day of the window and 09-01 is out.
			collection('duration-edge', { collection_date: '2026-09-02' }),
			collection('duration-out', { collection_date: '2026-09-01' }),
			// 03:30 UTC on the 3rd is the evening of the 2nd in New York.
			collection('exact-evening', { collected_at: new Date('2026-09-03T03:30:00Z') }),
			collection('exact-recent', { collected_at: new Date('2026-09-14T16:00:00Z') }),
			collection('no-problem', { collection_date: '2026-09-10', has_problem: false }),
		]);

		const { result } = await renderRead(() => useProblemCollectionsQueue(TODAY, TIME_ZONE));

		expect(result.current.count).toBe(3);
		expect(result.current.oldest).toBe('2026-09-02');
		expect(result.current.isReady).toBe(true);
	});

	it('answers zero with no oldest', async () => {
		const { result } = await renderRead(() => useProblemCollectionsQueue(TODAY, TIME_ZONE));

		expect(result.current).toMatchObject({ count: 0, oldest: null });
	});

	it('narrows the shape to problems in the window', async () => {
		await renderRead(() => useProblemCollectionsQueue(TODAY, TIME_ZONE));

		const predicates = subsetRequests(collections).map(subsetPredicate);
		expect(predicates.some((predicate) => predicate.includes('has_problem = true'))).toBe(true);
		expect(
			predicates.some((predicate) => predicate.includes('collection_date >= 2026-09-02')),
		).toBe(true);
		expect(predicates.some((predicate) => predicate.includes('collected_at >='))).toBe(true);
	});
});

describe('useOpenServiceRequestsQueue', () => {
	it('splits open requests into new and in progress by the stops that name them', async () => {
		seedRows(service_requests, [
			{ id: 'sr-new', request_date: '2026-09-10', closed_at: null },
			{ id: 'sr-old', request_date: '2026-05-26', closed_at: null },
			{ id: 'sr-in-progress', request_date: '2026-09-12', closed_at: null },
			{ id: 'sr-closed', request_date: '2026-01-01', closed_at: new Date('2026-09-01T12:00:00Z') },
		]);
		seedRows(assignment_items, [
			{
				id: 'stop-1',
				assignment_id: 'a1',
				entity_type: 'service_request',
				entity_id: 'sr-in-progress',
			},
			// A closed request on a stop is not open, so it is not in progress either.
			{ id: 'stop-2', assignment_id: 'a1', entity_type: 'service_request', entity_id: 'sr-closed' },
			// A stop at a habitat names no request.
			{ id: 'stop-3', assignment_id: 'a1', entity_type: 'habitat', entity_id: 'sr-new' },
		]);

		const { result } = await renderRead(() => useOpenServiceRequestsQueue());

		expect(result.current).toMatchObject({
			count: 3,
			newCount: 2,
			inProgressCount: 1,
			oldest: '2026-05-26',
			isReady: true,
		});
	});

	it('narrows both shapes rather than reading every request and every stop', async () => {
		await renderRead(() => useOpenServiceRequestsQueue());

		const requests = subsetRequests(service_requests).map(subsetPredicate);
		const stops = subsetRequests(assignment_items).map(subsetPredicate);
		expect(requests.some((predicate) => predicate.includes('closed_at IS NULL'))).toBe(true);
		expect(stops.some((predicate) => predicate.includes('entity_type = service_request'))).toBe(
			true,
		);
	});
});

describe('useInProgressAssignmentsQueue', () => {
	it('counts started assignments with no terminal timestamp, oldest by start day', async () => {
		seedRows(assignments, [
			{
				id: 'a-started',
				assignment_date: '2026-09-14',
				started_at: new Date('2026-09-14T13:00:00Z'),
				completed_at: null,
				cancelled_at: null,
			},
			{
				// 02:00 UTC on the 10th is the evening of the 9th in New York.
				id: 'a-started-evening',
				assignment_date: '2026-09-09',
				started_at: new Date('2026-09-10T02:00:00Z'),
				completed_at: null,
				cancelled_at: null,
			},
			{
				id: 'a-not-started',
				assignment_date: '2026-09-15',
				started_at: null,
				completed_at: null,
				cancelled_at: null,
			},
			{
				id: 'a-completed',
				assignment_date: '2026-09-01',
				started_at: new Date('2026-09-01T13:00:00Z'),
				completed_at: new Date('2026-09-01T17:00:00Z'),
				cancelled_at: null,
			},
			{
				id: 'a-cancelled',
				assignment_date: '2026-09-02',
				started_at: new Date('2026-09-02T13:00:00Z'),
				completed_at: null,
				cancelled_at: new Date('2026-09-02T14:00:00Z'),
			},
		]);

		const { result } = await renderRead(() => useInProgressAssignmentsQueue(TIME_ZONE));

		expect(result.current).toMatchObject({ count: 2, oldest: '2026-09-09', isReady: true });
	});

	it('answers zero with no oldest', async () => {
		const { result } = await renderRead(() => useInProgressAssignmentsQueue(TIME_ZONE));

		expect(result.current).toMatchObject({ count: 0, oldest: null });
	});

	it('narrows the shape to the in-progress rows', async () => {
		await renderRead(() => useInProgressAssignmentsQueue(TIME_ZONE));

		const predicates = subsetRequests(assignments).map(subsetPredicate);
		expect(
			predicates.some(
				(predicate) =>
					predicate.includes('NOT (started_at IS NULL)') &&
					predicate.includes('completed_at IS NULL') &&
					predicate.includes('cancelled_at IS NULL'),
			),
		).toBe(true);
	});
});

describe('useDueMissionsQueue', () => {
	it('counts unstarted missions scheduled before the end of today, however overdue', async () => {
		seedRows(missions, [
			mission('m-overdue', '2026-08-01T13:00:00Z'),
			// 23:30 in New York on the 15th is 03:30 UTC on the 16th: still today.
			mission('m-tonight', '2026-09-16T03:30:00Z'),
			mission('m-tomorrow', '2026-09-16T13:00:00Z'),
			mission('m-in-progress', '2026-09-15T12:00:00Z', {
				started_at: new Date('2026-09-15T12:05:00Z'),
			}),
			mission('m-cancelled', '2026-09-14T12:00:00Z', {
				cancelled_at: new Date('2026-09-14T12:05:00Z'),
			}),
		]);

		const { result } = await renderRead(() => useDueMissionsQueue(TODAY, TIME_ZONE));

		expect(result.current).toMatchObject({ count: 2, oldest: '2026-08-01', isReady: true });
	});

	it('narrows the shape to what is due', async () => {
		await renderRead(() => useDueMissionsQueue(TODAY, TIME_ZONE));

		const predicates = subsetRequests(missions).map(subsetPredicate);
		expect(
			predicates.some(
				(predicate) =>
					predicate.includes('started_at IS NULL') && predicate.includes('scheduled_start_at <'),
			),
		).toBe(true);
	});
});

function mission(
	id: string,
	scheduledStartAt: string,
	overrides: {
		readonly started_at?: Date | null;
		readonly completed_at?: Date | null;
		readonly cancelled_at?: Date | null;
	} = {},
) {
	return {
		id,
		mission_name: id,
		control_type: 'larvicide',
		scheduled_start_at: new Date(scheduledStartAt),
		started_at: null,
		completed_at: null,
		cancelled_at: null,
		...overrides,
	};
}
