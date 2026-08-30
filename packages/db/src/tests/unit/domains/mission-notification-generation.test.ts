/**
 * The cap on the registrations a refusal carries.
 *
 * `buffer_unit_not_convertible` is agency-wide, so an agency that fixed nothing
 * for a year can have every registration behind it. The refusal carries a page
 * of them and counts the rest, and the count is the part that goes wrong
 * silently: subtracting the cap instead of what was actually listed tells an
 * agency with exactly ten offenders that one is hidden, and sends somebody
 * looking for a row that is already on screen.
 */

import { describe, expect, it } from 'vitest';
import {
	capUnpriceableRegistrations,
	UNPRICEABLE_REGISTRATION_CAP,
	type UnpriceableRegistration,
} from '../../../domains/mission-notification-generation.js';

describe('capUnpriceableRegistrations', () => {
	it('lists them all and hides none when they fit', () => {
		const rows = registrations(3);

		expect(capUnpriceableRegistrations(rows, 3)).toEqual({
			registrations: rows,
			registrationsNotShown: 0,
		});
	});

	it('hides none at exactly the cap', () => {
		const rows = registrations(UNPRICEABLE_REGISTRATION_CAP);

		expect(capUnpriceableRegistrations(rows, UNPRICEABLE_REGISTRATION_CAP)).toEqual({
			registrations: rows,
			registrationsNotShown: 0,
		});
	});

	it('counts the ones the read left behind', () => {
		// The read is limited to the cap, so 50 offending registrations arrive as
		// 10 rows and a total of 50.
		const capped = capUnpriceableRegistrations(registrations(UNPRICEABLE_REGISTRATION_CAP), 50);

		expect(capped.registrations).toHaveLength(UNPRICEABLE_REGISTRATION_CAP);
		expect(capped.registrationsNotShown).toBe(50 - UNPRICEABLE_REGISTRATION_CAP);
	});

	it('cuts a read that came back over the cap anyway', () => {
		const capped = capUnpriceableRegistrations(registrations(UNPRICEABLE_REGISTRATION_CAP + 4), 14);

		expect(capped.registrations).toHaveLength(UNPRICEABLE_REGISTRATION_CAP);
		expect(capped.registrationsNotShown).toBe(4);
	});

	it('never reports a negative remainder', () => {
		// A total below the rows read is not a state the query produces, and a
		// negative here would render as "-2 more registrations are not shown".
		expect(capUnpriceableRegistrations(registrations(3), 1).registrationsNotShown).toBe(0);
	});
});

function registrations(count: number): readonly UnpriceableRegistration[] {
	return Array.from({ length: count }, (_, index) => ({
		registrationId: `registration-${index}`,
		contactId: `contact-${index}`,
		contactName: `Contact ${index}`,
		unitCode: 'gallon',
	}));
}
