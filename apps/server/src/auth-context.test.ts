import type { AuthUser } from '@simmer-mosquito/auth';
import type { ActiveLocalAuthIdentity } from '@simmer-mosquito/db';
import { describe, expect, it, vi } from 'vitest';
import { resolveAuthContext, toAuthMeBody } from './auth-context.js';

const workosUser: AuthUser = {
	workosUserId: 'workos_user_123',
	email: 'avery@example.com',
	firstName: 'Avery',
	lastName: 'Hale',
	displayName: 'Avery Hale',
	emailVerified: true,
	profilePictureUrl: null,
};

const localIdentity: ActiveLocalAuthIdentity = {
	user: {
		id: 'user-1',
		workosUserId: workosUser.workosUserId,
		email: workosUser.email,
		displayName: workosUser.displayName,
		firstName: workosUser.firstName,
		lastName: workosUser.lastName,
		emailVerified: workosUser.emailVerified,
		profilePictureUrl: workosUser.profilePictureUrl,
	},
	organization: {
		id: 'org-1',
		workosOrganizationId: 'workos_org_123',
		name: 'County Mosquito Control',
		slug: 'county-mosquito',
	},
	profile: {
		id: 'profile-1',
		organizationId: 'org-1',
		userId: 'user-1',
		displayName: 'Avery Hale',
		email: 'avery@example.com',
	},
	membership: {
		id: 'membership-1',
		organizationId: 'org-1',
		userId: 'user-1',
		profileId: 'profile-1',
		role: 'manager',
		status: 'active',
		isDefault: true,
	},
};

describe('resolveAuthContext', () => {
	it('returns 401 when WorkOS session is unauthenticated', async () => {
		const localResolver = vi.fn();

		const result = await resolveAuthContext({
			sealedSession: undefined,
			auth: {
				authenticateSession: async () => ({
					authenticated: false,
					reason: 'no_session_cookie_provided',
				}),
			},
			localIdentityResolver: {
				resolveActiveLocalAuthIdentity: localResolver,
			},
		});

		expect(result).toEqual({
			ok: false,
			status: 401,
			error: {
				type: 'unauthenticated',
				reason: 'no_session_cookie_provided',
			},
		});
		expect(localResolver).not.toHaveBeenCalled();
	});

	it('returns 403 when session has no selected WorkOS organization', async () => {
		const result = await resolveAuthContext({
			sealedSession: 'sealed',
			auth: {
				authenticateSession: async () => ({
					authenticated: true,
					user: workosUser,
					workosOrganizationId: null,
					sessionId: 'session-1',
					role: null,
					sealedSession: 'refreshed',
				}),
			},
			localIdentityResolver: {
				resolveActiveLocalAuthIdentity: vi.fn(),
			},
		});

		expect(result).toEqual({
			ok: false,
			status: 403,
			error: {
				type: 'organization_required',
				reason: 'WorkOS session has no selected organization.',
			},
			sealedSession: 'refreshed',
		});
	});

	it('returns 403 when SIMMER has no active membership/profile', async () => {
		const result = await resolveAuthContext({
			sealedSession: 'sealed',
			auth: {
				authenticateSession: async () => ({
					authenticated: true,
					user: workosUser,
					workosOrganizationId: 'workos_org_123',
					sessionId: 'session-1',
					role: 'viewer',
				}),
			},
			localIdentityResolver: {
				resolveActiveLocalAuthIdentity: async () => null,
			},
		});

		expect(result).toEqual({
			ok: false,
			status: 403,
			error: {
				type: 'membership_required',
				reason: 'No active SIMMER membership/profile exists for selected organization.',
				workosOrganizationId: 'workos_org_123',
			},
		});
	});

	it('builds context from active local identity and uses SIMMER role', async () => {
		const result = await resolveAuthContext({
			sealedSession: 'sealed',
			auth: {
				authenticateSession: async () => ({
					authenticated: true,
					user: workosUser,
					workosOrganizationId: 'workos_org_123',
					sessionId: 'session-1',
					role: 'viewer',
					sealedSession: 'refreshed',
				}),
			},
			localIdentityResolver: {
				resolveActiveLocalAuthIdentity: async () => localIdentity,
			},
		});

		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error('Expected auth context.');
		}

		expect(result.sealedSession).toBe('refreshed');
		expect(result.context.role).toBe('manager');
		expect(toAuthMeBody(result.context)).toEqual({
			authenticated: true,
			user: workosUser,
			workosOrganizationId: 'workos_org_123',
			localIdentity: {
				userId: 'user-1',
				organizationId: 'org-1',
				profileId: 'profile-1',
				membershipId: 'membership-1',
				role: 'manager',
			},
		});
	});
});
