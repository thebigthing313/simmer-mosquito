/**
 * One Contact, whole.
 *
 * The detail page and the edit form read the same thing: a Contact has no joins
 * — it is a name and the ways of reaching whoever it names — so unlike the trap
 * and collection record hooks there is no card-shaped variant to be separate
 * from. `ContactSummary` is the narrow one, and it exists for the surfaces that
 * only need to *name* a contact beside something else.
 *
 * `contacts` is on-demand, so this uses the status-gated `useLiveQuery` rather
 * than the suspense variant, which sticks after a navigation unmount over an
 * on-demand collection.
 */

import { eq, useLiveQuery } from '@tanstack/react-db';
import { contacts } from '../../lib/collections/contacts';
import type { Contact } from './contact-view';
import { mapCardGcTimeMs, unmatchableId } from './shared';

export function useContact(contactId: string | null | undefined): {
	readonly contact: Contact | undefined;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const id = contactId ?? unmatchableId;

	const result = useLiveQuery(
		{
			gcTime: mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ contact: contacts() })
					.where(({ contact }) => eq(contact.id, id))
					.select(({ contact }) => ({
						id: contact.id,
						contactName: contact.contact_name,
						company: contact.company,
						email: contact.email,
						preferredPhone: contact.preferred_phone,
						alternatePhone: contact.alternate_phone,
						department: contact.department,
						title: contact.title,
						wantsEmail: contact.wants_email,
						wantsSms: contact.wants_sms,
						wantsPhone: contact.wants_phone,
						metadata: contact.metadata,
						createdAt: contact.created_at,
						updatedAt: contact.updated_at,
						createdByProfileId: contact.created_by_profile_id,
						updatedByProfileId: contact.updated_by_profile_id,
					})),
		},
		[id],
	);

	return { contact: result.data[0], isReady: result.isReady, isError: result.isError };
}
