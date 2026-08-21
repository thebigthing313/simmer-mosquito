/**
 * Assignments dated within a window.
 *
 * The assignments schedule and the operations overview. `assignment_date` is a
 * `date` column rather than a `timestamptz`, so the bounds stay `YYYY-MM-DD`
 * strings and no zone is involved — an assignment is dated by the day it is
 * worked, not by an instant. That is the whole difference from `use-missions.ts`,
 * which schedules to a moment and has to widen its bounds to instants.
 *
 * Assignee and status are filtered by the caller in memory: status derives from
 * three nullable timestamps rather than a column, and the assignee filter carries
 * an "unassigned" pseudo-value that matches a null one.
 */

import { and, gte, lte, useLiveQuery } from '@tanstack/react-db';
import { assignments } from '../../lib/collections/assignments';
import type { AssignmentListing } from './assignment-view';
import { activityGcTimeMs } from './shared';

/**
 * The bound an unset half of the window gets.
 *
 * `dateParam` encodes "no bound" as an empty string, and comparing a date column
 * against `''` is not meaningfully total, so the absent side gets a date every
 * real row falls inside.
 */
const EARLIEST_DATE = '0001-01-01';
const LATEST_DATE = '9999-12-31';

export function useAssignments(
	from: string,
	to: string,
): {
	readonly assignments: readonly AssignmentListing[];
	readonly isLoading: boolean;
	readonly isReady: boolean;
} {
	const fromBound = from === '' ? EARLIEST_DATE : from;
	const toBound = to === '' ? LATEST_DATE : to;

	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ assignment: assignments })
					.where(({ assignment }) =>
						and(
							gte(assignment.assignment_date, fromBound),
							lte(assignment.assignment_date, toBound),
						),
					)
					.orderBy(({ assignment }) => assignment.assignment_date, 'desc')
					.select(({ assignment }) => ({
						id: assignment.id,
						assignmentName: assignment.assignment_name,
						assignmentDate: assignment.assignment_date,
						assignedToProfileId: assignment.assigned_to_profile_id,
						dueAt: assignment.due_at,
						startedAt: assignment.started_at,
						completedAt: assignment.completed_at,
						cancelledAt: assignment.cancelled_at,
					})),
		},
		[fromBound, toBound],
	);

	return { assignments: result.data, isLoading: result.isLoading, isReady: result.isReady };
}
