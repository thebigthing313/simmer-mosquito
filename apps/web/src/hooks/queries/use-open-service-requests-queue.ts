/**
 * The Dashboard's "open service requests" queue: every request with no
 * `closed_at`, split into new and in progress, and the oldest request date.
 *
 * `CONTEXT.md` (#989): a Service Request is **in progress** once a live
 * `assignment_items` row with `entity_type = 'service_request'` names it, on an
 * assignment in any state; a comment is not progress. **New** is every other
 * open request.
 *
 * Two subsets rather than a joined query, because the count needs the
 * requests that have no stop, and a `left` join's nullable side gets no
 * pushdown. The requests subset is the open ones and the stops subset is the
 * ones naming a request, each narrowing its own shape; the split is a set
 * lookup over the rows that arrived.
 */

import { eq, isNull, useLiveQuery } from '@tanstack/react-db';
import { assignment_items } from '../../lib/collections/assignment_items';
import { service_requests } from '../../lib/collections/service_requests';
import { activityGcTimeMs, type ElectricQueue } from './shared';

export interface OpenServiceRequestsQueue extends ElectricQueue {
	/** Open and named by no stop. */
	readonly newCount: number;
	/** Open and named by a live stop on an assignment. */
	readonly inProgressCount: number;
}

/** The `entity_type` an assignment stop stores for a Service Request. */
const SERVICE_REQUEST_ENTITY_TYPE = 'service_request';

export function useOpenServiceRequestsQueue(): OpenServiceRequestsQueue {
	const open = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ request: service_requests() })
				.where(({ request }) => isNull(request.closed_at))
				.select(({ request }) => ({ id: request.id, requestDate: request.request_date })),
	});

	const stops = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ item: assignment_items() })
				.where(({ item }) => eq(item.entity_type, SERVICE_REQUEST_ENTITY_TYPE))
				.select(({ item }) => ({ id: item.id, requestId: item.entity_id })),
	});

	const inProgressIds = new Set(stops.data.map((stop) => stop.requestId));
	let inProgressCount = 0;
	let oldest: string | null = null;
	for (const request of open.data) {
		if (inProgressIds.has(request.id)) {
			inProgressCount += 1;
		}
		if (oldest === null || request.requestDate < oldest) {
			oldest = request.requestDate;
		}
	}

	return {
		count: open.data.length,
		newCount: open.data.length - inProgressCount,
		inProgressCount,
		oldest,
		isReady: open.isReady && stops.isReady,
		isError: open.isError || stops.isError,
	};
}
