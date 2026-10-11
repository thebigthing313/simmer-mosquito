/**
 * The Dashboard's "missions due today or overdue" queue: not started, no
 * terminal timestamp, and scheduled to start before the end of today in the
 * Organization's zone. It returns the count and the day the oldest was
 * scheduled.
 */

import { and, count, isNull, lt, min, useLiveQuery } from '@tanstack/react-db';
import { missions } from '../../lib/collections/missions';
import { addCalendarDays, localCalendarDay, localDayStartAsInstant } from '../../lib/local-date';
import { type ElectricQueue, liveQueryGcTimeMs } from './shared';

export function useDueMissionsQueue(today: string, timeZone: string): ElectricQueue {
	const endOfToday = localDayStartAsInstant(addCalendarDays(today, 1), timeZone);

	const result = useLiveQuery({
		gcTime: liveQueryGcTimeMs,
		query: (query) =>
			query
				.from({ mission: missions() })
				.where(({ mission }) =>
					and(
						isNull(mission.started_at),
						isNull(mission.completed_at),
						isNull(mission.cancelled_at),
						lt(mission.scheduled_start_at, endOfToday),
					),
				)
				.select(({ mission }) => ({
					total: count(mission.id),
					oldestScheduledAt: min(mission.scheduled_start_at),
				})),
	});

	// An aggregate with no `groupBy` is one row, absent while nothing matches.
	const row = result.data[0];
	const total = Number(row?.total ?? 0);
	const oldestScheduledAt = row?.oldestScheduledAt as Date | string | null | undefined;

	return {
		count: total,
		// Reduced to the Organization's day, so the age counts calendar days
		// there rather than 24-hour spans from an instant.
		oldest: total === 0 ? null : localCalendarDay(oldestScheduledAt, timeZone) || null,
		isReady: result.isReady,
		isError: result.isError,
	};
}
