/**
 * One Service Request, as its own page and its edit form read it.
 *
 * The counterpart of `use-service-request.ts`, which joins the contact and the
 * address so a map card can name them in one query. This page names them too,
 * but from the whole rows — the parties card shows a contact's department and
 * consent, and the address in postal lines — so the join would be paid for
 * twice. It asks for the request; `useContact` and `useAddressRecord` ask for
 * the parties.
 *
 * `service_requests` is on-demand, so this uses the status-gated `useLiveQuery`
 * rather than the suspense variant, which sticks after a navigation unmount over
 * an on-demand collection.
 */

import { eq, useLiveQuery } from '@tanstack/react-db';
import { service_requests } from '../../lib/collections/service_requests';
import type { RequestIntakeType } from './service-request-view';
import { mapCardGcTimeMs, unmatchableId } from './shared';

/** A Service Request as its own surfaces hold one. */
export interface ServiceRequestRecord {
	readonly id: string;
	readonly organizationId: string;
	/** The sequential number the server assigns after the write commits. */
	readonly displayName: number | null;
	readonly intakeType: RequestIntakeType;
	/** `YYYY-MM-DD`. The day the public reported it. */
	readonly requestDate: string;
	readonly details: string;
	readonly contactId: string;
	readonly addressId: string;
	readonly receivedByProfileId: string | null;
	/** The instant somebody closed it, or `null` while it is open. */
	readonly closedAt: Date | null;
	readonly latitude: number;
	readonly longitude: number;
}

export function useServiceRequestRecord(requestId: string | null | undefined): {
	readonly request: ServiceRequestRecord | undefined;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const id = requestId ?? unmatchableId;

	const result = useLiveQuery(
		{
			gcTime: mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ request: service_requests() })
					.where(({ request }) => eq(request.id, id))
					.select(({ request }) => ({
						id: request.id,
						organizationId: request.organization_id,
						displayName: request.display_name,
						intakeType: request.intake_type,
						requestDate: request.request_date,
						details: request.details,
						contactId: request.contact_id,
						addressId: request.address_id,
						receivedByProfileId: request.received_by_profile_id,
						closedAt: request.closed_at,
						latitude: request.lat,
						longitude: request.lng,
					})),
		},
		[id],
	);

	return { request: result.data[0], isReady: result.isReady, isError: result.isError };
}
