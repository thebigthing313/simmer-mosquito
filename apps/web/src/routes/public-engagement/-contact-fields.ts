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

/** Domain issue path → the form field holding it, relative to the contact block. */
export const CONTACT_FIELD_PATHS: readonly (keyof ContactFormValues & string)[] = [
	'contactName',
	'company',
	'department',
	'title',
	'preferredPhone',
	'alternatePhone',
	'email',
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

/**
 * Client-side mirror of the domain's contact rules (`normalizeCreateContactDetails`):
 * at least one identifier, alternate phone needs a preferred phone, and each
 * "wants" preference needs its channel. The server re-validates authoritatively.
 */
export function validateContactForm(values: ContactFormValues): string | null {
	const hasName = values.contactName.trim().length > 0;
	const hasCompany = values.company.trim().length > 0;
	const hasPreferred = values.preferredPhone.trim().length > 0;
	const hasAlternate = values.alternatePhone.trim().length > 0;
	const hasEmail = values.email.trim().length > 0;

	if (!hasName && !hasCompany && !hasPreferred && !hasAlternate && !hasEmail) {
		return 'Enter at least one identifier — a name, company, phone, or email.';
	}
	if (hasAlternate && !hasPreferred) {
		return 'An alternate phone requires a preferred phone.';
	}
	if (values.wantsEmail && !hasEmail) {
		return 'Wants email requires an email address.';
	}
	if ((values.wantsSms || values.wantsPhone) && !hasPreferred) {
		return 'SMS and phone preferences require a preferred phone.';
	}
	return null;
}

function nullableText(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
}
