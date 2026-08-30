/**
 * Which commands a registration edit is.
 *
 * One form, four commands: who it warns, where it covers, how far around it
 * reaches, and the two operational flags. The domain refuses any of them that
 * arrives with nothing to change, so a save that names all four whenever the
 * user pressed Save fails on the three they did not touch, and one that names
 * too few drops that part of the form behind a 200.
 *
 * The location is the one worth being careful about. The drawn shape does not
 * travel as a column, because `geom` never syncs, so nothing about the row betrays
 * a redraw that was not sent, or a re-send of the shape the registration already
 * had. The only signal is whether the caller passed one, which is why
 * `geometry: null` has to mean "not touched" rather than "cleared", and why an
 * address-only edit still has to carry a shape.
 */

import { describe, expect, it } from 'vitest';
import {
	type RegistrationFields,
	registrationUpdatePlan,
} from '../../../../hooks/mutations/use-notification-registration-mutations';

const CONTACT = '11111111-1111-4111-8111-111111111111';
const OTHER_CONTACT = '22222222-2222-4222-8222-222222222222';
const ADDRESS = '33333333-3333-4333-8333-333333333333';
const METRES = '44444444-4444-4444-8444-444444444444';
const FEET = '55555555-5555-4555-8555-555555555555';

import type { GeoJsonPoint } from '@simmer-mosquito/mapping';

const POINT: GeoJsonPoint = { type: 'Point', coordinates: [-90.5, 35.5] };

function fields(overrides: Partial<RegistrationFields> = {}): RegistrationFields {
	return {
		contactId: CONTACT,
		addressId: ADDRESS,
		buffer: { distance: 500, unitId: METRES },
		flags: { hasBees: false, isNoSpray: true },
		...overrides,
	};
}

function plan(overrides: {
	readonly fields?: RegistrationFields;
	readonly geometry?: Parameters<typeof registrationUpdatePlan>[0]['geometry'];
}) {
	return registrationUpdatePlan({
		fields: overrides.fields ?? fields(),
		current: fields(),
		geometry: overrides.geometry ?? null,
	});
}

describe('registrationUpdatePlan', () => {
	it('is null when nothing moved, because an untouched save is not a write', () => {
		expect(plan({})).toBeNull();
	});

	it('names only the contact command when only the contact changed', () => {
		const result = plan({ fields: fields({ contactId: OTHER_CONTACT }) });

		expect(result?.intents).toEqual(['publicEngagement.updateNotificationRegistrationContact']);
		expect(result?.changes).toEqual({ contact_id: OTHER_CONTACT });
		expect(result?.arguments).toEqual({
			contact: { kind: 'existing', contactId: OTHER_CONTACT },
		});
	});

	it('names the location command for a redraw even when the address did not move', () => {
		const result = plan({ geometry: POINT });

		expect(result?.intents).toEqual(['publicEngagement.updateNotificationRegistrationLocation']);
		// The centroid columns move with the shape so the row on screen is not
		// stale while the write settles; `geom` itself never syncs.
		expect(result?.changes.geom_type).toBe('st_point');
		expect(result?.arguments.location).toMatchObject({
			address: { kind: 'existing', addressId: ADDRESS },
			geometry: POINT,
		});
	});

	it('sends no address rather than a missing one when the address is cleared', () => {
		const result = plan({ fields: fields({ addressId: null }), geometry: POINT });

		// `{ kind: 'none' }` is a real answer the command takes. Omitting the
		// address would be a different request, and the domain would read it as
		// unset rather than as deliberately absent.
		expect(result?.arguments.location).toMatchObject({ address: { kind: 'none' } });
		expect(result?.changes.address_id).toBeNull();
	});

	it('does not claim a redraw when the user only changed the address', () => {
		const result = plan({ fields: fields({ addressId: null }) });

		expect(result?.intents).toEqual(['publicEngagement.updateNotificationRegistrationLocation']);
		// No shape was drawn, so the centroid columns must not move. A plan that
		// invented one here would rewrite the geometry of a registration whose
		// shape the user never opened.
		expect(result?.changes.geom_type).toBeUndefined();
		expect(result?.changes.lat).toBeUndefined();
	});

	it('names the buffer command when only the unit changed', () => {
		// Both halves travel together: 500 metres and 500 feet are the same number
		// and a different catchment, so a plan that compared distance alone would
		// save the number and leave the old unit.
		const result = plan({ fields: fields({ buffer: { distance: 500, unitId: FEET } }) });

		expect(result?.intents).toEqual(['publicEngagement.updateNotificationRegistrationBuffer']);
		expect(result?.changes).toEqual({ buffer_distance: 500, buffer_unit_id: FEET });
	});

	it('clears both halves of the buffer together', () => {
		const result = plan({ fields: fields({ buffer: null }) });

		expect(result?.changes).toEqual({ buffer_distance: null, buffer_unit_id: null });
	});

	it('names the flags command when either flag moved', () => {
		const result = plan({ fields: fields({ flags: { hasBees: true, isNoSpray: true } }) });

		expect(result?.intents).toEqual(['publicEngagement.updateNotificationRegistrationFlags']);
		expect(result?.changes).toEqual({ has_bees: true, is_no_spray: true });
	});

	it('names every command a save that touched everything means', () => {
		const result = plan({
			fields: {
				contactId: OTHER_CONTACT,
				addressId: null,
				buffer: null,
				flags: { hasBees: true, isNoSpray: false },
			},
			geometry: POINT,
		});

		expect(result?.intents).toEqual([
			'publicEngagement.updateNotificationRegistrationContact',
			'publicEngagement.updateNotificationRegistrationLocation',
			'publicEngagement.updateNotificationRegistrationBuffer',
			'publicEngagement.updateNotificationRegistrationFlags',
		]);
	});

	it('carries no acknowledgement flag, because no writer reads one', () => {
		const result = plan({ geometry: POINT });

		// `docs/public-engagement-domain.md` says a location edit needs
		// `acknowledgedFutureOnlyChange` once mission notifications reference the
		// registration, and nothing enforces it: the domain only records the value
		// and the writer never reads it. Sending one would be a confirmation for a
		// rule that does not exist. Same position as `useServiceRequestMutations`.
		// If this test starts failing because a flag appeared, the refusal is what
		// should have driven it, through `useAcknowledgedWrite`.
		expect(result?.arguments.acknowledgedFutureOnlyChange).toBeUndefined();
		expect(result?.changes).not.toHaveProperty('acknowledgedFutureOnlyChange');
	});
});
