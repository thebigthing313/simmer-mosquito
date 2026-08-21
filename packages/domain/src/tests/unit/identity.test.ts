/**
 * The three identity commands ADR 0013's first slice folded in.
 *
 * What is worth testing here is what the routes they replace got wrong or could
 * not say. `PATCH /organization/current` required `name` on every request, so a
 * client could not send only the field it changed; and it dropped an
 * unrecognized US state to `null` in silence, which writes an address with the
 * state missing and tells nobody.
 *
 * The absent-versus-null distinction is the other half. A field the client did
 * not send must leave its column alone; a field sent as `null` must clear it.
 * They are the same value in JavaScript unless the builder asks with `in`.
 */

import { describe, expect, it } from 'vitest';
import {
	createProfileCommand,
	DomainValidationError,
	updateOrganizationDetailsCommand,
	updateProfileCommand,
} from '../../index.js';

const agency = {
	organizationId: 'f0dbf1c7-d278-441e-82b4-9292d390ce72',
	actorProfileId: '0105b111-e0be-46b0-b5e9-a87507889b51',
};
const profileId = 'a1f0c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

describe('updateOrganizationDetailsCommand', () => {
	it('carries only the fields that arrived', () => {
		const command = updateOrganizationDetailsCommand({ ...agency, phoneNumber: '555-0100' });

		expect(command.type).toBe('identity.updateOrganizationDetails');
		expect(command.payload.changes).toEqual({ phoneNumber: '555-0100' });
		expect(command.payload.expectedUpdatedAt).toBeNull();
	});

	it('keeps a field sent as null, which is how a value is cleared', () => {
		const command = updateOrganizationDetailsCommand({ ...agency, phoneNumber: null });

		expect(command.payload.changes).toEqual({ phoneNumber: null });
	});

	it('refuses a command with nothing to change', () => {
		expect(() => updateOrganizationDetailsCommand({ ...agency })).toThrow(DomainValidationError);
	});

	it('refuses a blank name rather than writing an agency with none', () => {
		expect(() => updateOrganizationDetailsCommand({ ...agency, name: '   ' })).toThrow(
			DomainValidationError,
		);
	});

	it('upper-cases a state code and refuses one that is not a state', () => {
		expect(
			updateOrganizationDetailsCommand({ ...agency, mailingRegion: 'ca' }).payload.changes
				.mailingRegion,
		).toBe('CA');

		// The route this replaces wrote `null` here and answered 200.
		expect(() => updateOrganizationDetailsCommand({ ...agency, mailingRegion: 'XX' })).toThrow(
			DomainValidationError,
		);
	});

	it('refuses an expectedUpdatedAt that is not a timestamp', () => {
		expect(() =>
			updateOrganizationDetailsCommand({
				...agency,
				name: 'Coastal MAD',
				expectedUpdatedAt: 'soon',
			}),
		).toThrow(DomainValidationError);
	});
});

describe('createProfileCommand', () => {
	it('takes the client-minted id and defaults to active', () => {
		const command = createProfileCommand({ ...agency, profileId, displayName: 'Dana Reyes' });

		expect(command.payload.profileId).toBe(profileId);
		expect(command.payload.isActive).toBe(true);
	});

	it('honours a Profile created inactive', () => {
		const command = createProfileCommand({
			...agency,
			profileId,
			displayName: 'Dana Reyes',
			isActive: false,
		});

		expect(command.payload.isActive).toBe(false);
	});

	it('refuses an id that is not a UUID, which is what keeps a replay safe', () => {
		expect(() =>
			createProfileCommand({ ...agency, profileId: 'dana', displayName: 'Dana Reyes' }),
		).toThrow(DomainValidationError);
	});
});

describe('updateProfileCommand', () => {
	it('carries only the field that moved', () => {
		expect(updateProfileCommand({ ...agency, profileId, isActive: false }).payload.changes).toEqual(
			{
				isActive: false,
			},
		);
	});

	it('refuses a save with nothing to change', () => {
		expect(() => updateProfileCommand({ ...agency, profileId })).toThrow(DomainValidationError);
	});
});
