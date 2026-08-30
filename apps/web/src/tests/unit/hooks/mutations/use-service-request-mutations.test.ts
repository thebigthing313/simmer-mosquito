/**
 * Which command a service-request edit is.
 *
 * The endpoint this replaces worked it out backwards: it read the body, and any
 * `contactId` present at all meant "move this request to that contact" — so an
 * edit form that seeded the field it already held sent a command with nothing to
 * do, and the domain refuses one of those. The whole save failed over the half
 * the user never touched.
 *
 * The contact also cannot travel as a column alone. `contact_id` is where a
 * *resolved* reference lands; the command takes the reference itself. Sending
 * the column and not the argument leaves the server with nothing to resolve, and
 * sending the argument without naming the command leaves it ignored — both
 * behind a 200.
 */

import { describe, expect, it } from 'vitest';
import {
	type ServiceRequestFields,
	serviceRequestUpdatePlan,
} from '../../../../hooks/mutations/use-service-request-mutations';

const CONTACT = '11111111-1111-4111-8111-111111111111';
const OTHER_CONTACT = '22222222-2222-4222-8222-222222222222';

function fields(overrides: Partial<ServiceRequestFields> = {}): ServiceRequestFields {
	return {
		intakeType: 'phone',
		requestDate: '2026-08-03',
		details: 'Mosquitoes out back',
		receivedByProfileId: null,
		...overrides,
	};
}

function plan(overrides: { readonly fields?: ServiceRequestFields; readonly contactId?: string }) {
	return serviceRequestUpdatePlan({
		fields: overrides.fields ?? fields(),
		current: fields(),
		contactId: overrides.contactId ?? CONTACT,
		currentContactId: CONTACT,
		// Withheld, which is what a first attempt sends.
		acknowledgedHistoricalContactChange: false,
	});
}

describe('serviceRequestUpdatePlan', () => {
	it('names only the details command when the contact is the one it already had', () => {
		const result = plan({ fields: fields({ details: 'Worse at dusk' }) });

		expect(result?.intents).toEqual(['publicEngagement.updateServiceRequestDetails']);
		expect(result?.changes).toEqual({
			intake_type: 'phone',
			request_date: '2026-08-03',
			details: 'Worse at dusk',
			received_by_profile_id: null,
		});
		// No reference: this edit is not moving the request to anybody.
		expect(result?.arguments).toBeUndefined();
	});

	it('carries the contact as a reference, beside the column it resolves into', () => {
		const result = plan({ contactId: OTHER_CONTACT });

		expect(result?.intents).toEqual(['publicEngagement.updateServiceRequestContact']);
		expect(result?.changes).toEqual({ contact_id: OTHER_CONTACT });
		expect(result?.arguments).toEqual({
			contact: { kind: 'existing', contactId: OTHER_CONTACT },
		});
	});

	it('names both when the details and the caller both moved', () => {
		const result = plan({
			contactId: OTHER_CONTACT,
			fields: fields({ intakeType: 'walk-in' }),
		});

		expect(result?.intents).toEqual([
			'publicEngagement.updateServiceRequestDetails',
			'publicEngagement.updateServiceRequestContact',
		]);
	});

	it('is not a write when nothing moved', () => {
		expect(plan({})).toBeNull();
	});
});
