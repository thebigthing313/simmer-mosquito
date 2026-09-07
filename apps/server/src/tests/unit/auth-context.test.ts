import type { AuthUser } from '@simmer-mosquito/auth';
import { createAuthClient } from '@simmer-mosquito/auth/browser';
import type { ActiveLocalAuthIdentity } from '@simmer-mosquito/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAuthContext, toAuthMeBody } from '../../auth-context.js';

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
	},
	organization: {
		id: 'org-1',
		workosOrganizationId: 'workos_org_123',
		name: 'County Mosquito Control',
		slug: 'county-mosquito',
		settings: { timezone: 'America/New_York' },
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

/** A live session on the fixture above, resolved the way a request resolves one. */
async function resolveActiveContext() {
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
		mayRefresh: true,
	});

	if (!result.ok) {
		throw new Error('Expected auth context.');
	}

	return result;
}

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
			mayRefresh: true,
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
			mayRefresh: true,
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
			mayRefresh: true,
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

	/**
	 * The operator half of a scope, resolved once here so a route serving both
	 * kinds of caller can ask without a second middleware.
	 *
	 * The failure this guards is quiet in both directions: resolved always-false
	 * locks SIMMER out of its own taxonomy, and resolved always-true hands every
	 * organization admin the global catalog.
	 */
	async function resolveWith(options: {
		readonly selectedOrganizationId: string;
		readonly operatorOrganizationId?: string | null;
	}) {
		const result = await resolveAuthContext({
			sealedSession: 'sealed',
			auth: {
				authenticateSession: async () => ({
					authenticated: true,
					user: workosUser,
					workosOrganizationId: options.selectedOrganizationId,
					sessionId: 'session-1',
					role: 'admin',
					sealedSession: 'refreshed',
				}),
			},
			localIdentityResolver: { resolveActiveLocalAuthIdentity: async () => localIdentity },
			mayRefresh: true,
			...(options.operatorOrganizationId === undefined
				? {}
				: { operatorOrganizationId: options.operatorOrganizationId }),
		});
		if (!result.ok) {
			throw new Error('Expected auth context.');
		}
		return result.context;
	}

	it('marks a session as an operator only when it selected the operator organization', async () => {
		const operator = await resolveWith({
			selectedOrganizationId: 'workos_org_simmer',
			operatorOrganizationId: 'workos_org_simmer',
		});
		const organization = await resolveWith({
			selectedOrganizationId: 'workos_org_123',
			operatorOrganizationId: 'workos_org_simmer',
		});

		expect([operator.isOperator, organization.isOperator]).toEqual([true, false]);
	});

	it('has no operators at all when the operator organization is unset', async () => {
		// The safe reading of an unconfigured deployment. `SIMMER_OPERATOR_ORG_ID`
		// is absent on a fresh environment, and the alternative — treating everyone
		// or the first organization as SIMMER — fails open.
		const unset = await resolveWith({
			selectedOrganizationId: 'workos_org_123',
			operatorOrganizationId: null,
		});
		const absent = await resolveWith({ selectedOrganizationId: 'workos_org_123' });

		expect([unset.isOperator, absent.isOperator]).toEqual([false, false]);
	});

	it('builds context from active local identity and uses SIMMER role', async () => {
		const result = await resolveActiveContext();

		expect(result.sealedSession).toBe('refreshed');
		expect(result.context.role).toBe('manager');
		expect(toAuthMeBody(result.context)).toEqual({
			authenticated: true,
			user: workosUser,
			workosOrganizationId: 'workos_org_123',
			localIdentity: {
				userId: 'user-1',
				organizationId: 'org-1',
				organizationName: 'County Mosquito Control',
				organizationSlug: 'county-mosquito',
				profileId: 'profile-1',
				membershipId: 'membership-1',
				role: 'manager',
			},
		});
	});
});

/**
 * The `/auth/me` contract, from producer to reader in one file.
 *
 * `toAuthMeBody` is annotated with `AuthenticatedMe`, so the compiler already
 * refuses a field the client declaration does not carry. What it cannot see is
 * the trip over the wire, and this is the cheapest place to watch that:
 * `apps/server` builds the body, `createAuthClient` reads it back through the
 * same declaration, and nothing here opens a socket or needs a DOM.
 *
 * Expected values come from the identity fixture rather than from
 * `toAuthMeBody`, so an assertion can disagree with the producer.
 */
describe('the /auth/me body', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('is read back by the auth client as an authenticated session', async () => {
		const { context } = await resolveActiveContext();
		const served = toAuthMeBody(context);

		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify(served), {
						status: 200,
						headers: { 'content-type': 'application/json' },
					}),
			),
		);

		const me = await createAuthClient({ serverUrl: 'https://simmer.test' }).getAuthMe();
		if (me.authenticated === false) {
			throw new Error(`Expected an authenticated session, got ${me.reason}.`);
		}

		expect(me.user).toEqual(workosUser);
		expect(me.workosOrganizationId).toBe(localIdentity.organization.workosOrganizationId);
		expect(me.localIdentity.userId).toBe(localIdentity.user.id);
		expect(me.localIdentity.organizationId).toBe(localIdentity.organization.id);
		expect(me.localIdentity.organizationName).toBe(localIdentity.organization.name);
		expect(me.localIdentity.organizationSlug).toBe(localIdentity.organization.slug);
		expect(me.localIdentity.profileId).toBe(localIdentity.profile.id);
		expect(me.localIdentity.membershipId).toBe(localIdentity.membership.id);
		expect(me.localIdentity.role).toBe(localIdentity.membership.role);
	});
});
