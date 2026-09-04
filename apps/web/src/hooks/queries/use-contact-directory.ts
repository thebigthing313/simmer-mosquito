/**
 * Every Contact the agency has, by name.
 *
 * The whole directory rather than a page of it, because the explorer filters
 * across seven fields at once — name, company, department, title, and all three
 * channels — and `ilike` over seven columns re-planned on every keystroke buys
 * nothing over a filter in the browser once the rows are here. The contact
 * picker is the opposite case — it wants six matches, not every row — and asks
 * the collection directly with an `ilike` subset, the way the address picker
 * does.
 *
 * No org predicate. The shape is scoped to the agency server-side — the proxy
 * forces the scope and ignores anything the caller asks for — so re-stating it
 * here is redundant, and a stale column spelling in a redundant predicate empties
 * a page rather than narrowing it.
 */

import { useLiveQuery } from '@tanstack/react-db';
import { contacts } from '../../lib/collections/contacts';
import { activityGcTimeMs } from './shared';

/** A Contact as the directory lists one, and as its search reads one. */
export interface ContactListing {
	readonly id: string;
	readonly contactName: string | null;
	readonly company: string | null;
	readonly department: string | null;
	readonly title: string | null;
	readonly email: string | null;
	readonly preferredPhone: string | null;
	readonly alternatePhone: string | null;
}

export function useContactDirectory(): {
	readonly contacts: readonly ContactListing[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ contact: contacts() })
					.orderBy(({ contact }) => contact.contact_name, 'asc')
					.select(({ contact }) => ({
						id: contact.id,
						contactName: contact.contact_name,
						company: contact.company,
						department: contact.department,
						title: contact.title,
						email: contact.email,
						preferredPhone: contact.preferred_phone,
						alternatePhone: contact.alternate_phone,
					})),
		},
		[],
	);

	return { contacts: result.data, isReady: result.isReady, isError: result.isError };
}
