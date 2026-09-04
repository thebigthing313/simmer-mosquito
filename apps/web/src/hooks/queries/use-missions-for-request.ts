/**
 * The missions a request has been scheduled onto.
 *
 * Two tables, because the link lives on the mission *item*: a request is put on a
 * mission by becoming one of its stops. A request can appear on more than one —
 * the domain flags that rather than forbidding it — so this reads as a list.
 *
 * One join rather than the two rounds it used to be. Reading the stop rows,
 * gathering their mission ids on the next render, and asking for those missions
 * separately is a render round-trip and a second subset request; joining does it
 * inside the pipeline. The join is `inner`: a stop whose mission has not streamed
 * yet is not a mission to show, and it appears when the row arrives.
 */

import { eq, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { mission_items } from '../../lib/collections/mission_items';
import { missions } from '../../lib/collections/missions';
import type { MissionListing, MissionStatus } from './operations-view';
import { missionStatus } from './operations-view';
import { mapCardGcTimeMs, unmatchableId } from './shared';

/** A mission named from somewhere else — a request's page, not its own. */
export interface MissionLink extends MissionListing {
	readonly status: MissionStatus;
}

export function useMissionsForRequest(requestId: string | null): {
	readonly missions: readonly MissionLink[];
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ item: mission_items() })
					.where(({ item }) => eq(item.requested_control_action_id, requestId ?? unmatchableId))
					.join(
						{ mission: missions() },
						({ item, mission }) => eq(item.mission_id, mission.id),
						'inner',
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
		[requestId],
	);

	// Not named `missions`: that is the collection this query reads from, and
	// shadowing it here makes the query above compile against an empty namespace.
	const linked = useMemo(
		() => result.data.map((mission) => ({ ...mission, status: missionStatus(mission) })),
		[result.data],
	);

	return { missions: linked, isReady: result.isReady };
}
