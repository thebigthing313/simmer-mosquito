/**
 * The missions a request has been scheduled onto.
 *
 * Two tables, because the link lives on the mission *item*: a request is put on a
 * mission by becoming one of its stops. A request can appear on more than one,
 * the domain flags that rather than forbidding it, so this reads as a list.
 *
 * ## Why the join is `left` and the sort is in JavaScript (#1026)
 *
 * Both tables are on-demand (`docs/sync.md`), so what each subset request
 * carries is what the browser loads. Measured against the memory source with two
 * stops on two missions, the `inner` join this used to make sent the `missions`
 * subset with **no predicate at all** and the stops subset as
 * `(requested_control_action_id = r1 and mission_id = ANY [m1, m2])`: the whole
 * missions table streamed, and the stops were then fetched by mission id, which
 * is the join running backwards. The `orderBy` on `mission.scheduled_start_at`
 * was suspected and is not the cause. Removing it alone left the missions
 * predicate empty.
 *
 * The cause is `getActiveAndLazySources` in `@tanstack/db`'s join compiler. For
 * an `inner` join it loads whole whichever collection holds **fewer rows in the
 * browser at compile time** and lazy-loads the other by join key, so on a cold
 * page, where both hold zero, `missions` is the active side and streams whole,
 * and which side a later page gets depends on what earlier pages left in memory.
 * A `left` join has no such choice: the main side is always active and the
 * joined side always lazy, fetched by `id = ANY(...)` over the join keys the
 * stops supplied, which works because every collection carries an index on `id`.
 * Measured the same way, the stops subset is `requested_control_action_id = r1`
 * and the missions subset is `id = ANY [m1, m2]`, one pipeline and no render
 * round trip. The suite beside this asserts both strings.
 *
 * `left` changes what the pipeline yields, not what the page shows. An unmatched
 * left join yields `undefined` for the missing side, so a stop whose mission
 * has not streamed yet arrives as a row with no `mission`, and {@link hasMission}
 * drops it here rather than drawing it; it appears when the row does. That is
 * the `inner` semantics this always had, applied one step later.
 *
 * The sort stays off the query because the trap it was suspected of is real for
 * an `orderBy` that drives a cursor, and the list is short: a request is rarely
 * on more than a few missions, so ordering it after the query costs nothing and
 * leaves the join with nothing to read off the missions side but the key.
 *
 * `mission_items` carries a client index on `mission_id` (#1014) for the join
 * running the other way, in `useAssignedRequestIds`, where the missions side is
 * the bounded one. It is not read here: a `left` join lazy-loads only the joined
 * side, by `missions.id`, so the index neither helps nor hurts this query.
 */

import type { Mission } from '@simmer-mosquito/sync';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { mission_items } from '../../lib/collections/mission_items';
import { missions } from '../../lib/collections/missions';
import type { MissionListing, MissionStatus } from './operations-view';
import { missionStatus } from './operations-view';
import { mapCardGcTimeMs, unmatchableId } from './shared';

/**
 * Whether the joined side of a row arrived.
 *
 * `@tanstack/db` types a `left`-joined namespace as the row with every field
 * widened by `undefined`, while what an unmatched row holds at runtime is
 * `undefined` for the namespace itself. This narrows on the one fact and hands
 * back the row type the collection declares.
 */
function hasMission(mission: { readonly id: string | undefined } | undefined): mission is Mission {
	return mission !== undefined && mission.id !== undefined;
}

/** A mission named from somewhere else: a request's page, not its own. */
export interface MissionLink extends MissionListing {
	readonly status: MissionStatus;
}

export function useMissionsForRequest(requestId: string | null): {
	readonly missions: readonly MissionLink[];
	readonly isReady: boolean;
} {
	const result = useLiveQuery({
		gcTime: mapCardGcTimeMs,
		query: (query) =>
			query
				.from({ item: mission_items() })
				.where(({ item }) => eq(item.requested_control_action_id, requestId ?? unmatchableId))
				.join(
					{ mission: missions() },
					({ item, mission }) => eq(item.mission_id, mission.id),
					'left',
				)
				// The whole namespace rather than nine columns, so a stop whose mission
				// has not arrived is one `undefined` to test rather than nine.
				.select(({ item, mission }) => ({ stopId: item.id, mission })),
	});

	// Not named `missions`: that is the collection this query reads from, and
	// shadowing it here makes the query above compile against an empty namespace.
	const linked: MissionLink[] = [];
	for (const { mission } of result.data) {
		if (!hasMission(mission)) continue;
		const listing: MissionListing = {
			id: mission.id,
			missionName: mission.mission_name,
			controlType: mission.control_type,
			plannedMethodId: mission.planned_method_id,
			assignedToProfileId: mission.assigned_to_profile_id,
			scheduledStartAt: mission.scheduled_start_at,
			startedAt: mission.started_at,
			completedAt: mission.completed_at,
			cancelledAt: mission.cancelled_at,
		};
		linked.push({ ...listing, status: missionStatus(listing) });
	}
	linked.sort(
		(a, b) =>
			b.scheduledStartAt.getTime() - a.scheduledStartAt.getTime() || a.id.localeCompare(b.id),
	);

	return { missions: linked, isReady: result.isReady };
}
