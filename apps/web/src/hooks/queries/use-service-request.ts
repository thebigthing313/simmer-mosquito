/**
 * One Service Request, with everything a card shows it beside.
 *
 * The map focus card, which appears next to a map that is already drawn — so it
 * renders its own skeleton rather than suspending and blanking what surrounds it.
 *
 * Three sequential queries before: the request, then its contact, then (inside
 * the address row) its address. Both are `inner` in the schema — a request must
 * name a contact and an address — but joined `left` here, because "the row has
 * not streamed yet" and "there is no such row" have to stay different states on a
 * card that draws its own pending UI.
 */

import { coalesce, eq } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { contacts } from '../../lib/collections/contacts';
import { service_requests } from '../../lib/collections/service_requests';
import type { ServiceRequest } from './service-request-view';
import { addressSelect, useRecordById } from './shared';

export function useServiceRequest(
	requestId: string | null,
	options?: { readonly gcTime?: number },
): { readonly request: ServiceRequest | undefined; readonly isReady: boolean } {
	const result = useRecordById({
		collection: service_requests(),
		id: requestId,
		gcTime: options?.gcTime,
		query: (query) =>
			query
				.join(
					{ contact: contacts() },
					({ record: request, contact }) => eq(request.contact_id, contact.id),
					'left',
				)
				.join(
					{ address: addresses() },
					({ record: request, address }) => eq(request.address_id, address.id),
					'left',
				)
				.select(({ record: request, contact, address }) => ({
					id: request.id,
					address: addressSelect(address),
					// `id` is the discriminator, as it is for an address: the one field a
					// real row cannot have null, so `undefined` means still streaming.
					contact: {
						id: contact.id,
						contactName: contact.contact_name,
						company: contact.company,
						email: contact.email,
						preferredPhone: contact.preferred_phone,
					},

					displayName: request.display_name,
					intakeType: request.intake_type,
					requestDate: request.request_date,
					details: request.details,
					contactId: request.contact_id,
					addressId: request.address_id,
					receivedByProfileId: request.received_by_profile_id,
					closedAt: coalesce(request.closed_at, null),
					closedByProfileId: request.closed_by_profile_id,

					latitude: request.lat,
					longitude: request.lng,
					geometryKind: request.geom_type,
					metadata: request.metadata,
					createdAt: request.created_at,
					updatedAt: request.updated_at,
					createdByProfileId: request.created_by_profile_id,
					updatedByProfileId: request.updated_by_profile_id,
				})),
	});

	return { request: result.record, isReady: result.isReady };
}
