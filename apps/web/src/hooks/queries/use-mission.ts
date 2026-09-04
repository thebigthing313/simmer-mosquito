/**
 * One mission — the subject of its own page.
 *
 * An entity hook rather than a surface one, which the folder keeps for the few
 * records that are what a page is *about*: the detail page, the edit form that
 * seeds from it, and the run page.
 *
 * It is also the warm-stream anchor for the create page. `missions` is
 * on-demand, so a write into it settles only if something is querying the row —
 * a create page that navigated away before this ran would wait out a txid that
 * never arrives, rather than waiting slowly.
 */

import { eq, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { missions } from '../../lib/collections/missions';
import type { MissionDetail, MissionStatus } from './operations-view';
import { missionStatus } from './operations-view';
import { mapCardGcTimeMs, unmatchableId } from './shared';

/** A mission with the lifecycle its three timestamps mean. */
export interface MissionRecord extends MissionDetail {
	readonly status: MissionStatus;
}

export function useMission(missionId: string | null): {
	readonly mission: MissionRecord | undefined;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ mission: missions() })
					.where(({ mission }) => eq(mission.id, missionId ?? unmatchableId))
					.select(({ mission }) => ({
						id: mission.id,
						organizationId: mission.organization_id,
						missionName: mission.mission_name,
						controlType: mission.control_type,
						plannedMethodId: mission.planned_method_id,
						assignedToProfileId: mission.assigned_to_profile_id,
						assignedByProfileId: mission.assigned_by_profile_id,
						scheduledStartAt: mission.scheduled_start_at,
						scheduledEndAt: mission.scheduled_end_at,
						rainDate: mission.rain_date,
						startedAt: mission.started_at,
						completedAt: mission.completed_at,
						cancelledAt: mission.cancelled_at,
						cancellationReason: mission.cancellation_reason,
						notificationTypeId: mission.notification_type_id,
						createdAt: mission.created_at,
						updatedAt: mission.updated_at,
					})),
		},
		[missionId],
	);

	// Derived rather than projected, and derived here rather than in the query:
	// the precedence has to match the server's own read, and a `caseWhen` per
	// query is how two copies of it drift. See `operations-view.ts`.
	const row = result.data[0];
	const mission = useMemo(
		() => (row === undefined ? undefined : { ...row, status: missionStatus(row) }),
		[row],
	);

	return { mission, isReady: result.isReady, isError: result.isError };
}
