import { isNull, useLiveQuery } from '@tanstack/react-db';
import { service_requests } from '../../lib/collections/service_requests';
import { activityGcTimeMs } from '../queries/shared';

/** One open service request, for the target picker. Closed requests take no new stops. */
export interface OpenServiceRequest {
	readonly id: string;
	readonly addressId: string;
	readonly details: string | null;
	readonly requestDate: string;
}

/**
 * Open service requests, for the target picker. Closed requests take no new
 * stops.
 */
export function useOpenServiceRequests(): {
	readonly requests: readonly OpenServiceRequest[];
	readonly isReady: boolean;
} {
	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ request: service_requests() })
				.where(({ request }) => isNull(request.closed_at))
				.orderBy(({ request }) => request.request_date, 'desc')
				.select(({ request }) => ({
					id: request.id,
					addressId: request.address_id,
					details: request.details,
					requestDate: request.request_date,
				})),
	});

	return { requests: result.data, isReady: result.isReady };
}
