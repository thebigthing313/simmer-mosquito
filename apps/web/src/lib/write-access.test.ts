import { describe, expect, it } from 'vitest';
import type { AuthMe } from '../auth';
import { canWriteRecords, isWriteBlocked, readOrgRole } from './write-access';

function authWithRole(role: string | null): AuthMe {
	return {
		authenticated: true,
		user: {
			workosUserId: 'user_1',
			email: 'crew@example.test',
			firstName: null,
			lastName: null,
			displayName: 'Crew',
			emailVerified: true,
			profilePictureUrl: null,
		},
		workosOrganizationId: 'org_1',
		localIdentity: {
			userId: 'user_1',
			organizationId: 'org_1',
			profileId: 'profile_1',
			membershipId: 'membership_1',
			role,
		},
	};
}

describe('readOrgRole', () => {
	it('reads each known membership role', () => {
		for (const role of ['owner', 'admin', 'manager', 'collector', 'viewer'] as const) {
			expect(readOrgRole(authWithRole(role))).toBe(role);
		}
	});

	it('falls back to viewer for anything it cannot recognise', () => {
		// The fallback is the *least* privileged role on purpose: a failure to read
		// identity has to deny, never grant.
		expect(readOrgRole(null)).toBe('viewer');
		expect(readOrgRole(authWithRole(null))).toBe('viewer');
		expect(readOrgRole(authWithRole('superuser'))).toBe('viewer');
		expect(readOrgRole({ authenticated: false, reason: 'no session' })).toBe('viewer');
	});
});

describe('canWriteRecords', () => {
	it('admits every role that records field work', () => {
		for (const role of ['owner', 'admin', 'manager', 'collector'] as const) {
			expect(canWriteRecords(authWithRole(role))).toBe(true);
		}
	});

	it('refuses viewers, and anyone whose role could not be read', () => {
		expect(canWriteRecords(authWithRole('viewer'))).toBe(false);
		expect(canWriteRecords(null)).toBe(false);
		expect(canWriteRecords({ authenticated: false, reason: 'no session' })).toBe(false);
	});
});

describe('isWriteBlocked', () => {
	it('awaits identity rather than reading a snapshot that may not exist yet', async () => {
		// The guard runs on cold loads — a pasted URL, a bookmark, a refresh — where
		// a synchronous snapshot read would be null and bounce everyone.
		let resolved = false;
		const context = {
			auth: {
				load: async (): Promise<AuthMe> => {
					await Promise.resolve();
					resolved = true;
					return authWithRole('collector');
				},
			},
		};

		expect(await isWriteBlocked(context)).toBe(false);
		expect(resolved).toBe(true);
	});

	it('blocks a viewer', async () => {
		const context = { auth: { load: () => Promise.resolve(authWithRole('viewer')) } };
		expect(await isWriteBlocked(context)).toBe(true);
	});
});
