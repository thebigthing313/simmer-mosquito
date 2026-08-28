/**
 * `/auth/me` is the one endpoint that may rotate the sealed session.
 *
 * Its twin is in `auth-middleware.test.ts`, where both middlewares are held to
 * verifying only. Together they are #298: a single-use refresh token spent by
 * one caller the browser asks serially, instead of by whichever handful of
 * concurrent requests happened to find the access token expired.
 *
 * If this endpoint ever stops refreshing, nothing else will, and every session
 * ends at its first access-token expiry.
 */

import type { AuthUser, SessionAuthenticationOptions } from '@simmer-mosquito/auth';
import type { ActiveLocalAuthIdentity } from '@simmer-mosquito/db';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthVariables } from '../../auth-middleware.js';
import { registerSessionRoutes } from '../../session-routes.js';

const workosUser: AuthUser = {
	workosUserId: 'workos_user_1',
	email: 'field@example.test',
	firstName: 'Frankie',
	lastName: 'Field',
	displayName: 'Frankie Field',
	emailVerified: true,
	profilePictureUrl: null,
};

/** Enough of a signed-in agency identity for `/auth/me` to answer 200. */
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
		workosOrganizationId: 'workos_org_1',
		name: 'County Mosquito Control',
		slug: 'county-mosquito',
		settings: { timezone: 'America/New_York' },
	},
	profile: {
		id: 'profile-1',
		organizationId: 'org-1',
		userId: 'user-1',
		displayName: workosUser.displayName,
		email: workosUser.email,
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

function sessionApp(options?: {
	readonly refuse?: { readonly reason: string };
	/** Resolve a membership, so `/auth/me` answers rather than refusing. */
	readonly signedIn?: boolean;
}) {
	const asked: SessionAuthenticationOptions[] = [];
	const setAuthCookie = vi.fn();
	const refusal = options?.refuse;
	const app = new Hono<{ Variables: AuthVariables }>();

	registerSessionRoutes(app, {
		auth: {
			getAuthorizationUrl: () => 'https://workos.test/authorize',
			authenticateCode: async () => {
				throw new Error('not used');
			},
			revokeSession: async () => undefined,
		},
		sessionProvider: {
			authenticateSession: async (_sealed, options) => {
				asked.push(options);
				if (options === undefined) {
					throw new Error('unreachable');
				}
				if (refusal !== undefined) {
					return { authenticated: false, reason: refusal.reason };
				}
				return {
					authenticated: true,
					user: workosUser,
					workosOrganizationId: 'workos_org_1',
					sessionId: 'session_1',
					role: 'manager',
					sealedSession: 'rotated',
				};
			},
		},
		localIdentityResolver: {
			resolveActiveLocalAuthIdentity: async () =>
				options?.signedIn === true ? localIdentity : null,
		},
		nodeEnv: 'test',
		appOrigin: 'https://app.test',
		appOrigins: ['https://app.test'],
		setAuthCookie,
		finalizeSession: async () => ({ organizationRequired: false }),
	});

	return { app, asked, setAuthCookie };
}

describe('/auth/me', () => {
	it('is allowed to refresh', async () => {
		const { app, asked } = sessionApp();

		await app.request('/auth/me');

		expect(asked).toEqual([{ mayRefresh: true }]);
	});

	it('writes the rotated session back to whoever asked', async () => {
		// The other half of the same trade. A rotation nobody stores leaves the
		// browser holding a refresh token that has already been spent, which is the
		// failure this endpoint exists to keep away from the concurrent callers.
		const { app, setAuthCookie } = sessionApp();

		await app.request('/auth/me');

		expect(setAuthCookie).toHaveBeenCalledWith(expect.anything(), 'rotated');
	});
});

/*
 * #304 started as four `/auth/me` refusals nobody could account for, beside a
 * session that stayed alive. The server knew which kind each was and said so
 * only in a response body nobody kept, so the question was settled by argument
 * rather than by evidence.
 *
 * `no_session_cookie_provided` is a caller with no session, which is ordinary.
 * Anything else is a refresh that failed, which is not.
 */
describe('/auth/me refusals', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('names why it refused, so a refusal is answerable later', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const { app } = sessionApp({ refuse: { reason: 'session_expired' } });

		const response = await app.request('/auth/me');

		expect(response.status).toBe(401);
		expect(warn.mock.calls[0]?.join(' ')).toContain('session_expired');
	});

	it('says nothing when the session is good', async () => {
		// One line per refusal is a signal. One line per request is a log nobody
		// reads, and this endpoint is called on every navigation.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const { app } = sessionApp({ signedIn: true });

		const response = await app.request('/auth/me');

		expect(response.status).toBe(200);
		expect(warn).not.toHaveBeenCalled();
	});
});
