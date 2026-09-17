/** @vitest-environment jsdom */

/**
 * Where a refused contact save puts its message.
 *
 * Two things were wrong here at once. The form ran a hand-rolled mirror of the
 * domain's contact rules that threw a bare string into the page alert, and the
 * field map behind the domain channel named the bare field while the builder
 * reports under a `contact.` prefix, so even the channel that knew which field
 * was wrong had nowhere to put the message.
 */

import { describe, expect, it } from 'vitest';
import type { ContactFormValues } from '../../../../../routes/public-engagement/-contact-fields';
import { validateContact } from '../../../../../routes/public-engagement/contacts/-contact-form';

function values(overrides: Partial<ContactFormValues> = {}): ContactFormValues {
	return {
		contactName: 'Jordan Rivera',
		company: '',
		department: '',
		title: '',
		preferredPhone: '',
		alternatePhone: '',
		email: '',
		wantsEmail: false,
		wantsSms: false,
		wantsPhone: false,
		...overrides,
	};
}

describe('a contact the domain refuses', () => {
	it('passes a contact with one identifier', () => {
		expect(validateContact(values())).toBeUndefined();
	});

	it('names an alternate phone with no preferred one on the alternate field', () => {
		const result = validateContact(values({ alternatePhone: '(555) 987-6543' }));

		expect(result?.fields?.alternatePhone).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	it('names a wanted email with no address on the email switch', () => {
		const result = validateContact(values({ wantsEmail: true }));

		expect(result?.fields?.wantsEmail).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	it('names wanted SMS with no phone on the SMS switch', () => {
		const result = validateContact(values({ wantsSms: true }));

		expect(result?.fields?.wantsSms).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	it('names a malformed address on the email field', () => {
		const result = validateContact(values({ email: 'not-an-address' }));

		expect(result?.fields?.email).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	// No single box is the wrong one, so this rule keeps the alert, where the
	// block's own description says the same thing.
	it('leaves a contact with no identifier at all on the form', () => {
		const result = validateContact(values({ contactName: '' }));

		expect(result?.fields).toBeUndefined();
		expect(result?.form).toBeDefined();
	});
});
