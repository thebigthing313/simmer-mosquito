/**
 * The contacts and addresses behind a bounded set of Service Requests.
 *
 * `contacts` and `addresses` are both on-demand, so this asks each for exactly
 * the rows the given requests point at — one `id = ANY($1)` subset each. That is
 * why the caller passes the rows it is about to *draw* rather than every row it
 * holds: a page of twenty-five ids loads reliably, and the whole season's worth
 * does not.
 *
 * Which is also why this is not a join. `useOrganizationServiceRequests` could
 * join both tables, and the planner would then collect join keys from every
 * request the organization has ever taken. This is the same two subsets, sized
 * to what is on screen.
 *
 * One implementation for two surfaces: the overview's open-requests panel and the
 * explorer's list had a near-identical copy each.
 */

import { inArray, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { addresses } from '../../lib/collections/addresses';
import { contacts } from '../../lib/collections/contacts';
import type { Address } from './address-view';
import type { ContactSummary } from './contact-view';
import { activityGcTimeMs, unmatchableId } from './shared';

export interface RequestParties {
	readonly contactById: ReadonlyMap<string, ContactSummary>;
	readonly addressById: ReadonlyMap<string, Address>;
	readonly isReady: boolean;
}

export function useRequestParties(
	requests: readonly { readonly contactId: string; readonly addressId: string }[],
): RequestParties {
	// Sorted and deduplicated so the query key is stable: the same page of rows in
	// a different order must not re-plan the query or move the subset.
	const contactIds = useMemo(
		() => [...new Set(requests.map((request) => request.contactId))].sort(),
		[requests],
	);
	const addressIds = useMemo(
		() => [...new Set(requests.map((request) => request.addressId))].sort(),
		[requests],
	);
	const contactKey = contactIds.join(',');
	const addressKey = addressIds.join(',');
	const contactQueryIds = contactIds.length > 0 ? contactIds : [unmatchableId];
	const addressQueryIds = addressIds.length > 0 ? addressIds : [unmatchableId];

	const contactResult = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ contact: contacts() })
					.where(({ contact }) => inArray(contact.id, contactQueryIds))
					.select(({ contact }) => ({
						id: contact.id,
						contactName: contact.contact_name,
						company: contact.company,
						email: contact.email,
						preferredPhone: contact.preferred_phone,
					})),
		},
		[contactKey],
	);

	const addressResult = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ address: addresses() })
					.where(({ address }) => inArray(address.id, addressQueryIds))
					.select(({ address }) => ({
						id: address.id,
						displayName: address.display_name,
						addressLine1: address.address_line_1,
						addressLine2: address.address_line_2,
						locality: address.locality,
						region: address.region,
						postalCode: address.postal_code,
					})),
		},
		[addressKey],
	);

	const contactRows = contactResult.data;
	const addressRows = addressResult.data;

	return useMemo(
		() => ({
			contactById: new Map(contactRows.map((contact) => [contact.id, contact] as const)),
			addressById: new Map(addressRows.map((address) => [address.id, address] as const)),
			isReady: contactResult.isReady && addressResult.isReady,
		}),
		[contactRows, addressRows, contactResult.isReady, addressResult.isReady],
	);
}
