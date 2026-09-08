/**
 * Telling apart the four things a generation can say.
 *
 * Three of them are successes and two of those look like failure, which is the
 * whole reason this reading is a function instead of an `if` in a component.
 * Rows created is obvious. Zero created on a second press means nothing changed
 * and is correct. A retired notification type means nobody was *eligible*, which
 * is a different message again from nobody being nearby, and it arrives as the
 * same empty `created` as the second one: `notification_type_active` is the only
 * thing that tells them apart.
 */

import { describe, expect, it } from 'vitest';
import {
	type GenerationResult,
	generationOutcomeOf,
	generationRefusalOf,
} from '../../../../hooks/mutations/use-mission-notification-generation';
import { CommandError } from '../../../../sync/command-error';

describe('generationRefusalOf', () => {
	it('carries the unit codes, which are the only actionable part of that refusal', () => {
		// Organization-wide: one registration holding a unit the conversion table
		// cannot price blocks generation for every mission. A message without the
		// codes leaves the operator with a refusal and nowhere to go.
		const error = new CommandError('Refused.', 409, {
			error: 'mission_notifications_refused',
			reason: 'buffer_unit_not_convertible',
			message: 'A buffer unit could not be converted.',
			unitCodes: ['gallon', 'acre'],
		});

		expect(generationRefusalOf(error)).toEqual({
			reason: 'buffer_unit_not_convertible',
			message: 'A buffer unit could not be converted.',
			unitCodes: ['gallon', 'acre'],
			registrations: [],
			registrationsNotShown: 0,
		});
	});

	it('carries the registrations behind the codes, which is where the fix is made', () => {
		// The codes say which unit is wrong. Nothing lists registrations across an
		// organization, so without these the operator has a unit name and no row.
		const error = new CommandError('Refused.', 409, {
			error: 'mission_notifications_refused',
			reason: 'buffer_unit_not_convertible',
			message: 'A buffer unit could not be converted.',
			unitCodes: ['gallon'],
			registrations: [
				{
					registrationId: '11111111-1111-4111-8111-111111111111',
					contactId: '22222222-2222-4222-8222-222222222222',
					contactName: 'Rosa Delgado',
					unitCode: 'gallon',
				},
			],
			registrationsNotShown: 4,
		});

		expect(generationRefusalOf(error)?.registrations).toEqual([
			{
				registrationId: '11111111-1111-4111-8111-111111111111',
				contactId: '22222222-2222-4222-8222-222222222222',
				contactName: 'Rosa Delgado',
				unitCode: 'gallon',
			},
		]);
		expect(generationRefusalOf(error)?.registrationsNotShown).toBe(4);
	});

	it('keeps an unnamed contact and drops a row with no contact to link to', () => {
		const error = new CommandError('Refused.', 409, {
			error: 'mission_notifications_refused',
			reason: 'buffer_unit_not_convertible',
			message: 'A buffer unit could not be converted.',
			unitCodes: ['gallon'],
			registrations: [
				{
					registrationId: 'a',
					contactId: 'b',
					contactName: null,
					unitCode: 'gallon',
				},
				{ registrationId: 'c', contactName: 'Nobody', unitCode: 'gallon' },
			],
			registrationsNotShown: -1,
		});

		const refusal = generationRefusalOf(error);
		// A Contact can be unnamed and the link still goes somewhere. A row with no
		// contact id links nowhere, so it is dropped rather than listed dead.
		expect(refusal?.registrations).toEqual([
			{ registrationId: 'a', contactId: 'b', contactName: null, unitCode: 'gallon' },
		]);
		// And a negative would render as "-1 more registrations are not shown".
		expect(refusal?.registrationsNotShown).toBe(0);
	});

	it('gives an empty code and registration list for the refusals that carry none', () => {
		const error = new CommandError('Refused.', 409, {
			error: 'mission_notifications_refused',
			reason: 'mission_has_no_items',
			message: 'This mission has no stops.',
		});

		// Not undefined: the card renders both lists without first asking which
		// refusal it has.
		expect(generationRefusalOf(error)?.unitCodes).toEqual([]);
		expect(generationRefusalOf(error)?.registrations).toEqual([]);
		expect(generationRefusalOf(error)?.registrationsNotShown).toBe(0);
	});

	it('drops non-strings out of the code list rather than rendering them', () => {
		const error = new CommandError('Refused.', 409, {
			error: 'mission_notifications_refused',
			reason: 'buffer_unit_not_convertible',
			message: 'A buffer unit could not be converted.',
			unitCodes: ['gallon', 7, null],
		});

		expect(generationRefusalOf(error)?.unitCodes).toEqual(['gallon']);
	});

	it('is null for a failure that is not a generation refusal', () => {
		const error = new CommandError('Nope.', 403, { error: 'forbidden', reason: 'role_too_low' });

		// The card rethrows these, so a wrong answer here turns a permission problem
		// into a standing alert about notifications.
		expect(generationRefusalOf(error)).toBeNull();
	});

	it('is null for an ordinary error with no body', () => {
		expect(generationRefusalOf(new Error('Network down.'))).toBeNull();
	});
});

describe('generationOutcomeOf', () => {
	it('reports the count when rows were created', () => {
		expect(generationOutcomeOf(result({ created: [row('a'), row('b')] }))).toEqual({
			kind: 'created',
			count: 2,
		});
	});

	it('reports nothing new for a second press that changed nothing', () => {
		// Correct rather than broken: the mission already has its list. Saying so
		// differently from a failure is the whole point.
		expect(generationOutcomeOf(result({ created: [] }))).toEqual({ kind: 'nothing_new' });
	});

	it('separates a retired type from an empty result that simply changed nothing', () => {
		// Both arrive as an empty `created`, and they send the operator to two
		// different places: "nothing new" means the list is already right, and a
		// retired type means nobody could ever have been on it. Collapsing them
		// leaves somebody checking their registrations for a problem that is in the
		// notification type catalog.
		expect(generationOutcomeOf(result({ created: [], notification_type_active: false }))).toEqual({
			kind: 'type_retired',
		});
	});
});

function result(overrides: Partial<GenerationResult>): GenerationResult {
	return {
		mission_id: '66666666-6666-4666-8666-666666666666',
		notification_type_id: '77777777-7777-4777-8777-777777777777',
		notification_type_active: true,
		created: [],
		...overrides,
	};
}

function row(id: string) {
	return {
		id,
		notification_registration_id: id,
		contact_id: id,
		channel: 'email',
		destination: 'someone@example.test',
	};
}
