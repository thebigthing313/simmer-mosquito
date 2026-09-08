/**
 * The identity commands, which since ADR 0013 is every identity write there is.
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
	changeRoleCommand,
	createProfileCommand,
	DomainValidationError,
	endMembershipCommand,
	inviteCommand,
	reinviteCommand,
	updateOrganizationDetailsCommand,
	updateProfileCommand,
} from '../../index.js';

const organization = {
	organizationId: 'f0dbf1c7-d278-441e-82b4-9292d390ce72',
	actorProfileId: '0105b111-e0be-46b0-b5e9-a87507889b51',
};
const profileId = 'a1f0c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const membershipId = 'b2e1d3c4-5f6a-4b7c-8d9e-0f1a2b3c4d5e';

describe('updateOrganizationDetailsCommand', () => {
	it('carries only the fields that arrived', () => {
		const command = updateOrganizationDetailsCommand({ ...organization, phoneNumber: '555-0100' });

		expect(command.type).toBe('identity.updateOrganizationDetails');
		expect(command.payload.changes).toEqual({ phoneNumber: '555-0100' });
		expect(command.payload.expectedUpdatedAt).toBeNull();
	});

	it('keeps a field sent as null, which is how a value is cleared', () => {
		const command = updateOrganizationDetailsCommand({ ...organization, phoneNumber: null });

		expect(command.payload.changes).toEqual({ phoneNumber: null });
	});

	it('refuses a command with nothing to change', () => {
		expect(() => updateOrganizationDetailsCommand({ ...organization })).toThrow(
			DomainValidationError,
		);
	});

	it('refuses a blank name rather than writing an organization with none', () => {
		expect(() => updateOrganizationDetailsCommand({ ...organization, name: '   ' })).toThrow(
			DomainValidationError,
		);
	});

	it('upper-cases a state code and refuses one that is not a state', () => {
		expect(
			updateOrganizationDetailsCommand({ ...organization, mailingRegion: 'ca' }).payload.changes
				.mailingRegion,
		).toBe('CA');

		// The route this replaces wrote `null` here and answered 200.
		expect(() =>
			updateOrganizationDetailsCommand({ ...organization, mailingRegion: 'XX' }),
		).toThrow(DomainValidationError);
	});

	it('accepts a US mailing country in either case and refuses any other', () => {
		expect(
			updateOrganizationDetailsCommand({ ...organization, mailingCountry: 'us' }).payload.changes
				.mailingCountry,
		).toBe('US');

		expect(() =>
			updateOrganizationDetailsCommand({ ...organization, mailingCountry: 'CA' }),
		).toThrow(DomainValidationError);
	});

	it('accepts a null mailing country, because an unfilled address is not an error', () => {
		expect(
			updateOrganizationDetailsCommand({ ...organization, mailingCountry: null }).payload.changes
				.mailingCountry,
		).toBeNull();
	});

	it('refuses an expectedUpdatedAt that is not a timestamp', () => {
		expect(() =>
			updateOrganizationDetailsCommand({
				...organization,
				name: 'Coastal MAD',
				expectedUpdatedAt: 'soon',
			}),
		).toThrow(DomainValidationError);
	});
});

describe('createProfileCommand', () => {
	it('takes the client-minted id and defaults to active', () => {
		const command = createProfileCommand({ ...organization, profileId, displayName: 'Dana Reyes' });

		expect(command.payload.profileId).toBe(profileId);
		expect(command.payload.isActive).toBe(true);
	});

	it('honours a Profile created inactive', () => {
		const command = createProfileCommand({
			...organization,
			profileId,
			displayName: 'Dana Reyes',
			isActive: false,
		});

		expect(command.payload.isActive).toBe(false);
	});

	it('refuses an id that is not a UUID, which is what keeps a replay safe', () => {
		expect(() =>
			createProfileCommand({ ...organization, profileId: 'dana', displayName: 'Dana Reyes' }),
		).toThrow(DomainValidationError);
	});
});

describe('updateProfileCommand', () => {
	it('carries only the field that moved', () => {
		expect(
			updateProfileCommand({ ...organization, profileId, isActive: false }).payload.changes,
		).toEqual({
			isActive: false,
		});
	});

	it('refuses a save with nothing to change', () => {
		expect(() => updateProfileCommand({ ...organization, profileId })).toThrow(
			DomainValidationError,
		);
	});
});

/**
 * The four that span WorkOS.
 *
 * Nothing here knows WorkOS exists, which is the point: a builder validates what
 * a payload says about itself, and everything about the second system is stored
 * state or a network call. What these do carry is the property the spanning rules
 * are built on — every id the command creates is the caller's, so a replay
 * collides on the primary key rather than granting a second time.
 */
describe('inviteCommand', () => {
	const invite = {
		...organization,
		membershipId,
		profileId,
		invitedEmail: 'casey@example.test',
		role: 'manager',
	} as const;

	it('carries both ids the invitation writes', () => {
		const command = inviteCommand(invite);

		expect(command.type).toBe('identity.invite');
		expect(command.payload).toMatchObject({ membershipId, profileId });
	});

	// The uniqueness rule the schema owns is on `lower(invited_email)`, so an
	// address carried in one case and matched in another would refuse a race the
	// server is supposed to swallow.
	it('lower-cases the address, because the uniqueness rule is on the lower-cased one', () => {
		expect(
			inviteCommand({ ...invite, invitedEmail: 'Casey@Example.Test' }).payload.invitedEmail,
		).toBe('casey@example.test');
	});

	it('leaves the name off rather than inventing one', () => {
		expect(inviteCommand(invite).payload.displayName).toBeNull();
		expect(inviteCommand({ ...invite, displayName: '  ' }).payload.displayName).toBeNull();
	});

	it.each(['casey', '@example.test', 'casey@'])('refuses %s as an address', (invitedEmail) => {
		expect(() => inviteCommand({ ...invite, invitedEmail })).toThrow(DomainValidationError);
	});

	// Without the id there is no key for a retry to collide on, and the spanning
	// rules say a command in that state must not be built at all.
	it('refuses a membership id that is not a UUID', () => {
		expect(() => inviteCommand({ ...invite, membershipId: 'casey' })).toThrow(
			DomainValidationError,
		);
	});

	it('refuses a profile id that is not a UUID', () => {
		expect(() => inviteCommand({ ...invite, profileId: 'casey' })).toThrow(DomainValidationError);
	});
});

describe('reinviteCommand', () => {
	// No address and no Profile: both belong to the Membership already, and a
	// re-invitation that could change the address would be an invitation of
	// somebody else wearing the same row.
	it('names a Membership and the role its new link will grant, and nothing else', () => {
		const command = reinviteCommand({ ...organization, membershipId, role: 'collector' });

		expect(command.payload).toEqual({ ...organization, membershipId, role: 'collector' });
	});

	it('refuses a role that is not one of the five', () => {
		expect(() =>
			reinviteCommand({ ...organization, membershipId, role: 'superuser' as never }),
		).toThrow(DomainValidationError);
	});
});

describe('changeRoleCommand', () => {
	it('carries the membership and the role', () => {
		expect(changeRoleCommand({ ...organization, membershipId, role: 'admin' }).payload).toEqual({
			...organization,
			membershipId,
			role: 'admin',
		});
	});

	it('refuses a role that arrived as nothing', () => {
		expect(() => changeRoleCommand({ ...organization, membershipId, role: undefined })).toThrow(
			DomainValidationError,
		);
	});
});

describe('endMembershipCommand', () => {
	it('takes the membership and no fields at all', () => {
		expect(endMembershipCommand({ ...organization, membershipId }).payload).toEqual({
			...organization,
			membershipId,
		});
	});

	it('refuses a membership id that is not a UUID', () => {
		expect(() => endMembershipCommand({ ...organization, membershipId: 'casey' })).toThrow(
			DomainValidationError,
		);
	});
});
