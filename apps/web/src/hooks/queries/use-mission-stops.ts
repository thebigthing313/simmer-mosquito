/**
 * A mission's stops, in dispatch order, with whatever names them.
 *
 * ## What this replaces
 *
 * Three queries, two of them sequential. The page read the stops, gathered their
 * request ids and their address ids on the render that followed, and asked for
 * each set separately — two subset requests that could not start until the first
 * had answered. Two `left` joins do it inside the pipeline, and the names fill in
 * as rows arrive rather than a render later.
 *
 * `left` on both: a stop need not name a request and need not sit at an address,
 * and an `inner` join would drop the stop off the list rather than leave its
 * label blank. Every reference is guarded on the *stop's* own column, because an
 * unmatched left join yields `undefined` for every field of the missing side —
 * which is how a fallback ends up building a label out of nothing.
 *
 * The counts are not here. `useMissionItemCounts` computes them as aggregates for
 * a whole page of missions at once, and a page showing one mission's stops
 * already holds every row it would need to count.
 */

import { caseWhen, eq, isNull, useLiveQuery } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { mission_items } from '../../lib/collections/mission_items';
import { requested_control_actions } from '../../lib/collections/requested_control_actions';
import type { MissionStop } from './operations-view';
import { mapCardGcTimeMs, unmatchableId } from './shared';

export function useMissionStops(missionId: string | null): {
	readonly stops: readonly MissionStop[];
	readonly isLoading: boolean;
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ item: mission_items })
					.where(({ item }) => eq(item.mission_id, missionId ?? unmatchableId))
					.join(
						{ request: requested_control_actions },
						({ item, request }) => eq(item.requested_control_action_id, request.id),
						'left',
					)
					.join(
						{ address: addresses },
						({ item, address }) => eq(item.address_id, address.id),
						'left',
					)
					.orderBy(({ item }) => item.position, 'asc')
					.select(({ item, request, address }) => ({
						id: item.id,
						missionId: item.mission_id,
						position: item.position,
						latitude: item.lat,
						longitude: item.lng,
						geometryKind: item.geom_type,
						requestedControlActionId: item.requested_control_action_id,
						// Guarded on the stop's own column, so a stop that names no request
						// reads as `null` rather than as the `undefined` an unmatched join
						// yields — and a summary is legitimately null on a real request, so
						// nullness alone could not tell the two apart.
						requestSummary: caseWhen(
							isNull(item.requested_control_action_id),
							null,
							request.summary,
						),
						requestControlType: caseWhen(
							isNull(item.requested_control_action_id),
							null,
							request.control_type,
						),
						addressId: item.address_id,
						address: {
							id: address.id,
							displayName: address.display_name,
							addressLine1: address.address_line_1,
							addressLine2: address.address_line_2,
							locality: address.locality,
							region: address.region,
							postalCode: address.postal_code,
						},
						completedAt: item.completed_at,
						skippedAt: item.skipped_at,
						skipReason: item.skip_reason,
						updatedAt: item.updated_at,
					})),
		},
		[missionId],
	);

	return {
		stops: result.data,
		isLoading: missionId !== null && result.isLoading,
		isReady: result.isReady,
	};
}
