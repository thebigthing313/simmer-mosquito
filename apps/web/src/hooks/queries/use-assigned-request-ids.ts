/**
 * The requests for control that are assigned: named by a live stop on a
 * mission that is scheduled or in progress.
 *
 * `CONTEXT.md` (#989): a Requested Control Action is **assigned** while a live
 * Mission Item on a `scheduled` or `inProgress` Mission names it, so a stop on
 * a cancelled or completed mission leaves the request unassigned again. The
 * requests explorer's `unassigned` filter is the complement of this set.
 *
 * ## Why this is its own query and not a join on the requests
 *
 * The explorer reads `useRequestedControlActions`, a windowed subset of an
 * on-demand collection whose `where` is pushed down to the shape. Joining the
 * stops onto that query and filtering by the joined side would narrow the
 * result and leave the fetch as wide as it was, and a predicate spanning both
 * aliases is pushed to neither: the window would stop reaching Postgres. So the
 * stops are a second subset, bounded on their own side by
 * `requested_control_action_id is not null` and on the mission side by the two
 * terminal columns, and the explorer applies the set in memory after the window,
 * the way it applies `status` today.
 *
 * `inner`: a stop whose mission has not streamed yet is not one to count until
 * the row arrives. `inner` picks its driven side by which collection holds
 * fewer rows in the browser, which is why `useMissionsForRequest` moved to
 * `left` (#1026); it is harmless here because both sides carry a predicate of
 * their own, so whichever side streams whole streams a bounded set. The mission's
 * status is two `isNull` tests rather than `missionStatus` in the hook body, so
 * the narrowing is the shape's and a mission that completes leaves the set
 * without every stop being re-read.
 */

import { and, eq, isNull, not, useLiveQuery } from '@tanstack/react-db';
import { mission_items } from '../../lib/collections/mission_items';
import { missions } from '../../lib/collections/missions';
import { activityGcTimeMs } from './shared';

export function useAssignedRequestIds(): {
	readonly assignedRequestIds: ReadonlySet<string>;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ item: mission_items() })
				.where(({ item }) => not(isNull(item.requested_control_action_id)))
				.join(
					{ mission: missions() },
					({ item, mission }) => eq(item.mission_id, mission.id),
					'inner',
				)
				.where(({ mission }) => and(isNull(mission.completed_at), isNull(mission.cancelled_at)))
				.select(({ item }) => ({
					id: item.id,
					requestId: item.requested_control_action_id,
				})),
	});

	const assignedRequestIds = new Set<string>();
	for (const stop of result.data) {
		if (stop.requestId !== null) {
			assignedRequestIds.add(stop.requestId);
		}
	}

	return { assignedRequestIds, isReady: result.isReady, isError: result.isError };
}
