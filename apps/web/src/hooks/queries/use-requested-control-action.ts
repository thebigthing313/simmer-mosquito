/**
 * One request for control — the subject of its own page.
 *
 * An entity hook, which the folder keeps for the few records that are what a
 * page is *about*: the detail page, the edit form that seeds from it, and the
 * map card beside them.
 *
 * It is also the warm-stream anchor for the create page.
 * `requested_control_actions` is on-demand, so a write into it settles only if
 * something is querying the row — a create page that navigated away before this
 * ran would wait out a txid that never arrives, rather than waiting slowly.
 */

import { eq, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { requested_control_actions } from '../../lib/collections/requested_control_actions';
import type { RequestDetail, RequestStatus } from './operations-view';
import { requestStatus } from './operations-view';
import { mapCardGcTimeMs, unmatchableId } from './shared';

/** A request with the state its one nullable timestamp means. */
export interface RequestRecord extends RequestDetail {
	readonly status: RequestStatus;
}

export function useRequestedControlAction(requestId: string | null): {
	readonly request: RequestRecord | undefined;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ request: requested_control_actions() })
					.where(({ request }) => eq(request.id, requestId ?? unmatchableId))
					.select(({ request }) => ({
						id: request.id,
						organizationId: request.organization_id,
						controlType: request.control_type,
						recommendedMethodId: request.recommended_method_id,
						summary: request.summary,
						habitatId: request.habitat_id,
						inspectionId: request.inspection_id,
						collectionId: request.collection_id,
						addressId: request.address_id,
						latitude: request.lat,
						longitude: request.lng,
						geometryKind: request.geom_type,
						requestedByProfileId: request.requested_by_profile_id,
						requestedAt: request.requested_at,
						resolvedAt: request.resolved_at,
						resolvedByProfileId: request.resolved_by_profile_id,
						createdAt: request.created_at,
						updatedAt: request.updated_at,
						createdByProfileId: request.created_by_profile_id,
						updatedByProfileId: request.updated_by_profile_id,
					})),
		},
		[requestId],
	);

	// Derived rather than projected, and derived here rather than in the query —
	// the same reading `useMission` gets. See `operations-view.ts`.
	const row = result.data[0];
	const request = useMemo(
		() => (row === undefined ? undefined : { ...row, status: requestStatus(row) }),
		[row],
	);

	return { request, isReady: result.isReady, isError: result.isError };
}
