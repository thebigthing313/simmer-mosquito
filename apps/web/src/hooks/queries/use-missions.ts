/**
 * Missions scheduled to start within a window.
 *
 * The schedule page and the operations overview. A mission list is a schedule
 * rather than a history, so the window is bounded on both sides and both pages
 * open on one that straddles today.
 *
 * Status, control type, and assignee are filtered by the caller in memory:
 * status derives from three nullable timestamps rather than a column, "unassigned"
 * matches a null one, and re-narrowing the shape per filter change would re-stream
 * the whole window each time.
 */

import { and, gte, lte, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { missions } from '../../lib/collections/missions';
import { addCalendarDays, localDayStartAsInstant } from '../../lib/local-date';
import { useOrganizationTimeZone } from '../use-organization-time-zone';
import type { MissionListing } from './operations-view';
import { activityGcTimeMs } from './shared';

/** See `use-requested-control-actions.ts` — same column type, same trap. */
const EARLIEST_INSTANT = new Date(0);
const LATEST_INSTANT = new Date('9999-12-31T00:00:00.000Z');

export function useMissions(
	from: string,
	to: string,
): {
	readonly missions: readonly MissionListing[];
	readonly isLoading: boolean;
	readonly isReady: boolean;
} {
	const timeZone = useOrganizationTimeZone();
	const fromBound = useMemo(
		() => (from === '' ? EARLIEST_INSTANT : localDayStartAsInstant(from, timeZone)),
		[from, timeZone],
	);
	// The start of the day *after* `to`, so a mission dispatched at any hour of the
	// closing day is still inside the window.
	const toBound = useMemo(
		() => (to === '' ? LATEST_INSTANT : localDayStartAsInstant(addCalendarDays(to, 1), timeZone)),
		[to, timeZone],
	);

	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ mission: missions() })
					.where(({ mission }) =>
						and(
							gte(mission.scheduled_start_at, fromBound),
							lte(mission.scheduled_start_at, toBound),
						),
					)
					.orderBy(({ mission }) => mission.scheduled_start_at, 'desc')
					.select(({ mission }) => ({
						id: mission.id,
						missionName: mission.mission_name,
						controlType: mission.control_type,
						plannedMethodId: mission.planned_method_id,
						assignedToProfileId: mission.assigned_to_profile_id,
						scheduledStartAt: mission.scheduled_start_at,
						startedAt: mission.started_at,
						completedAt: mission.completed_at,
						cancelledAt: mission.cancelled_at,
					})),
		},
		[fromBound, toBound],
	);

	return { missions: result.data, isLoading: result.isLoading, isReady: result.isReady };
}
