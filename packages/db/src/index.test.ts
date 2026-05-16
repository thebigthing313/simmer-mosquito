import { describe, expect, it } from 'vitest';
import { resolveMembershipProvisioning, validateExistingProfileInvitationTarget } from './index.js';

describe('resolveMembershipProvisioning', () => {
	it('reuses invited membership and preserves invited role', () => {
		const result = resolveMembershipProvisioning({
			existingMembership: null,
			invitedMembership: {
				id: 'membership-invited',
				profileId: 'profile-invited',
				role: 'manager',
			},
			existingMembershipCount: 0,
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
			},
			invitedMembership: {
				id: 'membership-invited',
				profileId: 'profile-invited',
				role: 'owner',
			},
			existingMembershipCount: 2,
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
			}),
		).toEqual({
			source: 'new',
			role: 'viewer',
			isDefault: false,
		});
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
