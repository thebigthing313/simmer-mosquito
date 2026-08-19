/**
 * Open requests in the agency, newest first — what a mission can be pointed at.
 *
 * The picker on a mission's page. Resolved requests are deliberately absent: a
 * request already dealt with is not new work to plan, even though a stop already
 * on a mission keeps its link if the request is resolved afterwards.
 *
 * The filter is a pushed-down `isNull` rather than a pass in the hook body, so a
 * resolved request leaves the result without the whole list being rebuilt — and
 * so the subset asks for the open ones rather than for every request the agency
 * has ever raised.
 *
 * No organization predicate. The shape is already scoped to the caller's agency
 * server-side, and a client-side `organization_id` filter is at best redundant
 * and at worst empties the page when the column is not in the projection.
 */

import { isNull, useLiveQuery } from '@tanstack/react-db';
import { requested_control_actions } from '../../lib/collections/requested_control_actions';
import type { OpenRequest } from './operations-view';
import { activityGcTimeMs } from './shared';

export function useOpenRequestedControlActions(): {
	readonly requests: readonly OpenRequest[];
	readonly isReady: boolean;
} {
	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ request: requested_control_actions })
				.where(({ request }) => isNull(request.resolved_at))
				.orderBy(({ request }) => request.requested_at, 'desc')
				.select(({ request }) => ({
					id: request.id,
					controlType: request.control_type,
					summary: request.summary,
					// The centroid, which is what a stop copied off this request seeds its
					// optimistic row with — the server takes the real geometry from the
					// request itself, inside the transaction.
					latitude: request.lat,
					longitude: request.lng,
					geometryKind: request.geom_type,
					addressId: request.address_id,
					requestedAt: request.requested_at,
				})),
	});

	return { requests: result.data, isReady: result.isReady };
}
