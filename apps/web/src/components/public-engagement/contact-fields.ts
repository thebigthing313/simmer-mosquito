import type { ContactFields } from '../../hooks/mutations/use-contact-mutations';
import type { Contact } from '../../hooks/queries/contact-view';

/**
 * The contact's own fields, as a form holds them.
 *
 * A contact is filled in from two places — its own page, and inline while a
 * service request is being logged — and the two were carrying different subsets
 * of the record. Both read this shape now, so an intake taker keying a caller in
 * captures everything the directory does.
 *
 * What the fields are called on the way *out* is `ContactFields`, which the write
 * seam owns: this module's job is the round trip between a form's strings and
 * that shape.
 */

export interface ContactFormValues {
	readonly contactName: string;
	readonly company: string;
	readonly department: string;
	readonly title: string;
	readonly preferredPhone: string;
	readonly alternatePhone: string;
	readonly email: string;
	readonly wantsEmail: boolean;
	readonly wantsSms: boolean;
	readonly wantsPhone: boolean;
}

/**
 * The contact fields a domain issue can name, in the order the block draws them.
 *
 * The builder reports each one under `contact.<field>`, since
 * `normalizeCreateContactDetails` is handed that prefix, so both callers map the
 * same names onto whatever they call the block's fields. The three preference switches are on the list because
 * the builder refuses each of them without the channel it needs, and a caller
 * whose map stopped at `email` sent those three to the page alert.
 */
export const CONTACT_FIELD_PATHS: readonly (keyof ContactFormValues & string)[] = [
	'contactName',
	'company',
	'department',
	'title',
	'preferredPhone',
	'alternatePhone',
	'email',
	'wantsEmail',
	'wantsSms',
	'wantsPhone',
];

export function defaultContactFormValues(): ContactFormValues {
	return {
		contactName: '',
		company: '',
		department: '',
		title: '',
		preferredPhone: '',
		alternatePhone: '',
		email: '',
		wantsEmail: false,
		wantsSms: false,
		wantsPhone: false,
	};
}

export function defaultsFromContact(contact: Contact): ContactFormValues {
	return {
		contactName: contact.contactName ?? '',
		company: contact.company ?? '',
		department: contact.department ?? '',
		title: contact.title ?? '',
		preferredPhone: contact.preferredPhone ?? '',
		alternatePhone: contact.alternatePhone ?? '',
		email: contact.email ?? '',
		wantsEmail: contact.wantsEmail,
		wantsSms: contact.wantsSms,
		wantsPhone: contact.wantsPhone,
	};
}

/** Normalize form values into the contact row fields (blanks become null). */
export function contactFieldsFromValues(values: ContactFormValues): ContactFields {
	return {
		contactName: nullableText(values.contactName),
		company: nullableText(values.company),
		department: nullableText(values.department),
		title: nullableText(values.title),
		preferredPhone: nullableText(values.preferredPhone),
		alternatePhone: nullableText(values.alternatePhone),
		email: nullableText(values.email),
		wantsEmail: values.wantsEmail,
		wantsSms: values.wantsSms,
		wantsPhone: values.wantsPhone,
	};
}

function nullableText(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
}
