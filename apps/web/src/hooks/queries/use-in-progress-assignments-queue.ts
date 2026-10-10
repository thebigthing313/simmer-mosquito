/**
 * The Dashboard's "assignments started and not finished" queue: `started_at`
 * set, `completed_at` and `cancelled_at` null, and the day the oldest was
 * started.
 */

import { and, count, isNull, min, not, useLiveQuery } from '@tanstack/react-db';
import { assignments } from '../../lib/collections/assignments';
import { localCalendarDay } from '../../lib/local-date';
import { activityGcTimeMs, type ElectricQueue } from './shared';

export function useInProgressAssignmentsQueue(timeZone: string): ElectricQueue {
	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ assignment: assignments() })
				.where(({ assignment }) =>
					and(
						not(isNull(assignment.started_at)),
						isNull(assignment.completed_at),
						isNull(assignment.cancelled_at),
					),
				)
				.select(({ assignment }) => ({
					total: count(assignment.id),
					oldestStartedAt: min(assignment.started_at),
				})),
	});

	// An aggregate with no `groupBy` is one row, absent while nothing matches.
	const row = result.data[0];
	const total = Number(row?.total ?? 0);
	const oldestStartedAt = row?.oldestStartedAt as Date | string | null | undefined;

	return {
		count: total,
		oldest: total === 0 ? null : localCalendarDay(oldestStartedAt, timeZone) || null,
		isReady: result.isReady,
		isError: result.isError,
	};
}
