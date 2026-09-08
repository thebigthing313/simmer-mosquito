/**
 * What one Contact has called about.
 *
 * A correlated subset rather than a join: `service_requests` is on-demand, and
 * asking it for one contact's rows is exactly the shape the mode is for. The
 * contact's own page is the only surface that reads it.
 */

import { eq, useLiveQuery } from '@tanstack/react-db';
import { service_requests } from '../../lib/collections/service_requests';
import { mapCardGcTimeMs, unmatchableId } from './shared';

/** A Service Request as a contact's page lists one. */
export interface ContactRequestListing {
	readonly id: string;
	readonly displayName: number | null;
	readonly requestDate: string;
	/** The instant it was closed, or `null` while it is open. */
	readonly closedAt: Date | null;
}

export function useContactServiceRequests(contactId: string | null | undefined): {
	readonly requests: readonly ContactRequestListing[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const id = contactId ?? unmatchableId;

	const result = useLiveQuery(
		{
			gcTime: mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ request: service_requests() })
					.where(({ request }) => eq(request.contact_id, id))
					.orderBy(({ request }) => request.request_date, 'desc')
					.select(({ request }) => ({
						id: request.id,
						displayName: request.display_name,
						requestDate: request.request_date,
						closedAt: request.closed_at,
					})),
		},
		[id],
	);

	return { requests: result.data, isReady: result.isReady, isError: result.isError };
}
