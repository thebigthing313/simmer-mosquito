import { describe, expect, it } from 'vitest';
import {
	resolveMembershipProvisioning,
	validateExistingProfileInvitationTarget,
	validateMembershipRemoval,
} from '../../index.js';

describe('resolveMembershipProvisioning', () => {
	it('reuses invited membership and preserves invited role', () => {
		const result = resolveMembershipProvisioning({
			existingMembership: null,
			invitedMembership: {
				id: 'membership-invited',
				profileId: 'profile-invited',
				role: 'manager',
				status: 'invited',
			},
			existingMembershipCount: 0,
			userHasDefaultMembership: false,
		});

		expect(result).toEqual({
			source: 'invited',
			membershipId: 'membership-invited',
			profileId: 'profile-invited',
			role: 'manager',
			isDefault: false,
		});
	});

	it('keeps existing membership role when user logs in again', () => {
		const result = resolveMembershipProvisioning({
			existingMembership: {
				id: 'membership-existing',
				profileId: 'profile-existing',
				role: 'collector',
				status: 'active',
			},
			invitedMembership: {
				id: 'membership-invited',
				profileId: 'profile-invited',
				role: 'owner',
				status: 'invited',
			},
			existingMembershipCount: 2,
			userHasDefaultMembership: true,
		});

		expect(result).toEqual({
			source: 'existing',
			membershipId: 'membership-existing',
			profileId: 'profile-existing',
			role: 'collector',
			isDefault: false,
		});
	});

	it('uses owner only for first non-invited membership', () => {
		expect(
			resolveMembershipProvisioning({
				existingMembership: null,
				invitedMembership: null,
				existingMembershipCount: 0,
				userHasDefaultMembership: false,
			}),
		).toEqual({
			source: 'new',
			role: 'owner',
			isDefault: true,
		});

		expect(
			resolveMembershipProvisioning({
				existingMembership: null,
				invitedMembership: null,
				existingMembershipCount: 1,
				userHasDefaultMembership: false,
			}),
		).toEqual({
			source: 'new',
			role: 'viewer',
			isDefault: true,
		});
	});

	it('does not claim a second default when the user already has one', () => {
		// A user who becomes the first member of a *second* organization owns it,
		// but must NOT be marked default again (memberships_one_default_per_user).
		expect(
			resolveMembershipProvisioning({
				existingMembership: null,
				invitedMembership: null,
				existingMembershipCount: 0,
				userHasDefaultMembership: true,
			}),
		).toEqual({
			source: 'new',
			role: 'owner',
			isDefault: false,
		});
	});
});

describe('resolveMembershipProvisioning, on an ended membership', () => {
	// The reason ending a membership needed a change here at all: this function
	// runs on every sign-in and every organization switch, and the `existing`
	// branch writes `status: 'active'`. Without the refusal, revoking somebody's
	// access lasted until they next signed in, and their old role came back with
	// them.
	it('does not resume a membership that was ended', () => {
		expect(
			resolveMembershipProvisioning({
				existingMembership: {
					id: 'membership-ended',
					profileId: 'profile-ended',
					role: 'admin',
					status: 'inactive',
				},
				invitedMembership: null,
				existingMembershipCount: 3,
				userHasDefaultMembership: true,
			}),
		).toEqual({ source: 'revoked' });
	});

	// A fresh invitation is how somebody comes back, and it stages an `invited`
	// row of its own. Refusing on the ended row would make the invitation
	// unacceptable.
	it('still honours a new invitation for somebody previously ended', () => {
		expect(
			resolveMembershipProvisioning({
				existingMembership: null,
				invitedMembership: {
					id: 'membership-reinvited',
					profileId: 'profile-ended',
					role: 'viewer',
					status: 'invited',
				},
				existingMembershipCount: 3,
				userHasDefaultMembership: true,
			}),
		).toMatchObject({ source: 'invited', role: 'viewer' });
	});
});

describe('validateMembershipRemoval', () => {
	const active = { role: 'manager', status: 'active' } as const;

	it('allows ending an ordinary membership', () => {
		expect(
			validateMembershipRemoval({ membership: active, isSelf: false, activeOwnerCount: 1 }),
		).toBeNull();
	});

	it('refuses a membership that is not this agency’s', () => {
		expect(
			validateMembershipRemoval({ membership: null, isSelf: false, activeOwnerCount: 2 }),
		).toBe('membership_not_found');
	});

	// The actor is standing on the page they would lose. Leaving is a different
	// act, with a different confirmation, and nobody has asked for it.
	it('refuses removing yourself', () => {
		expect(
			validateMembershipRemoval({ membership: active, isSelf: true, activeOwnerCount: 2 }),
		).toBe('membership_is_self');
	});

	// A one-way door: an agency with no active owner cannot hand out a role or
	// invite anyone, including a replacement owner.
	it('refuses the last active owner', () => {
		expect(
			validateMembershipRemoval({
				membership: { role: 'owner', status: 'active' },
				isSelf: false,
				activeOwnerCount: 1,
			}),
		).toBe('last_active_owner');
	});

	it('allows an owner while another active owner remains', () => {
		expect(
			validateMembershipRemoval({
				membership: { role: 'owner', status: 'active' },
				isSelf: false,
				activeOwnerCount: 2,
			}),
		).toBeNull();
	});

	// An owner who is already inactive is not holding the last seat, and running
	// the removal again is how a SIMMER row and a WorkOS membership that drifted
	// apart are brought back together.
	it('allows re-ending an owner who is already inactive', () => {
		expect(
			validateMembershipRemoval({
				membership: { role: 'owner', status: 'inactive' },
				isSelf: false,
				activeOwnerCount: 0,
			}),
		).toBeNull();
	});
});

describe('validateExistingProfileInvitationTarget', () => {
	it('allows an active login-less profile to receive an invitation', () => {
		expect(
			validateExistingProfileInvitationTarget({
				id: 'profile-historical',
				userId: null,
				deletedAt: null,
			}),
		).toBeNull();
	});

	it('rejects missing, already-linked, and deleted profiles', () => {
		expect(validateExistingProfileInvitationTarget(null)).toBe('profile_not_found');
		expect(
			validateExistingProfileInvitationTarget({
				id: 'profile-linked',
				userId: 'user-1',
				deletedAt: null,
			}),
		).toBe('profile_already_linked');
		expect(
			validateExistingProfileInvitationTarget({
				id: 'profile-deleted',
				userId: null,
				deletedAt: new Date('2026-05-01T00:00:00.000Z'),
			}),
		).toBe('profile_deleted');
	});
});
