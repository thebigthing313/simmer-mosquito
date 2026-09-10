/**
 * One Contact, whole.
 *
 * The detail page and the edit form read the same thing: a Contact has no joins
 * — it is a name and the ways of reaching whoever it names — so unlike the trap
 * and collection record hooks there is no card-shaped variant to be separate
 * from. `ContactSummary` is the narrow one, and it exists for the surfaces that
 * only need to *name* a contact beside something else.
 */

import { contacts } from '../../lib/collections/contacts';
import type { Contact } from './contact-view';
import { useRecordById } from './shared';

export function useContact(contactId: string | null | undefined): {
	readonly contact: Contact | undefined;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useRecordById({
		collection: contacts(),
		id: contactId ?? null,
		query: (query) =>
			query.select(({ record: contact }) => ({
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
	});

	return { contact: result.record, isReady: result.isReady, isError: result.isError };
}
