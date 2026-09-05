/**
 * Which command a contact edit is, and the round trip that decides it.
 *
 * Who somebody is and how the organization may reach them are two commands, and
 * each server-side builder reads its own half of the one body. That makes both
 * mistakes silent. Name an intent the change set has nothing for and the domain
 * refuses a command with nothing to change — so a save that always names both
 * fails whenever the user touched only one group. Name one too few and the
 * other half of the form is dropped behind a 200.
 *
 * The last test is the one that catches the whole class at once. A save compares
 * what the form holds against what the record holds, and the comparison is only
 * honest if both sides came through the same normalization: `defaultsFromContact`
 * turns nulls into empty strings for the inputs, and `contactFieldsFromValues`
 * turns them back. If those two ever disagree, nothing throws — every save just
 * quietly names both commands forever.
 */

import { describe, expect, it } from 'vitest';
import {
	type ContactFields,
	contactUpdatePlan,
} from '../../../../hooks/mutations/use-contact-mutations';
import type { Contact } from '../../../../hooks/queries/contact-view';
import {
	contactFieldsFromValues,
	defaultsFromContact,
} from '../../../../routes/public-engagement/-contact-fields';

function fields(overrides: Partial<ContactFields> = {}): ContactFields {
	return {
		contactName: 'Dana Reyes',
		company: null,
		department: null,
		title: null,
		preferredPhone: '555-0100',
		alternatePhone: null,
		email: null,
		wantsEmail: false,
		wantsSms: true,
		wantsPhone: false,
		...overrides,
	};
}

describe('contactUpdatePlan', () => {
	it('names only the identity command when only identity changed', () => {
		const plan = contactUpdatePlan(fields({ title: 'Property Manager' }), fields());

		expect(plan?.intents).toEqual(['publicEngagement.updateContactDetails']);
		expect(plan?.changes).toEqual({
			contact_name: 'Dana Reyes',
			company: null,
			department: null,
			title: 'Property Manager',
		});
	});

	it('names only the communication command when only consent changed', () => {
		// Consent is the half that matters most to get right: withdrawing SMS must
		// not travel as an edit to somebody's job title.
		const plan = contactUpdatePlan(fields({ wantsSms: false }), fields());

		expect(plan?.intents).toEqual(['publicEngagement.updateContactCommunication']);
		expect(plan?.changes).toEqual({
			preferred_phone: '555-0100',
			alternate_phone: null,
			email: null,
			wants_email: false,
			wants_sms: false,
			wants_phone: false,
		});
	});

	it('names both when both halves moved', () => {
		const plan = contactUpdatePlan(
			fields({ company: 'Harborview HOA', email: 'dana@example.test', wantsEmail: true }),
			fields(),
		);

		expect(plan?.intents).toEqual([
			'publicEngagement.updateContactDetails',
			'publicEngagement.updateContactCommunication',
		]);
	});

	it('is not a write when nothing moved', () => {
		expect(contactUpdatePlan(fields(), fields())).toBeNull();
	});

	it('reads an untouched record back as itself', () => {
		const contact: Contact = {
			id: '11111111-1111-4111-8111-111111111111',
			contactName: 'Dana Reyes',
			company: null,
			email: 'dana@example.test',
			preferredPhone: '555-0100',
			alternatePhone: null,
			department: 'Grounds',
			title: null,
			wantsEmail: true,
			wantsSms: false,
			wantsPhone: false,
			metadata: null,
			createdAt: new Date('2026-08-01T00:00:00.000Z'),
			updatedAt: new Date('2026-08-01T00:00:00.000Z'),
			createdByProfileId: null,
			updatedByProfileId: null,
		};

		const current = contactFieldsFromValues(defaultsFromContact(contact));

		expect(contactUpdatePlan(current, current)).toBeNull();
		// And the round trip preserved the record rather than merely agreeing with
		// itself: a pair of transforms that both dropped a field would also be null.
		expect(current).toEqual({
			contactName: 'Dana Reyes',
			company: null,
			department: 'Grounds',
			title: null,
			preferredPhone: '555-0100',
			alternatePhone: null,
			email: 'dana@example.test',
			wantsEmail: true,
			wantsSms: false,
			wantsPhone: false,
		});
	});
});
