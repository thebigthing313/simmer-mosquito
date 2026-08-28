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
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
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

function sessionApp() {
	const asked: SessionAuthenticationOptions[] = [];
	const setAuthCookie = vi.fn();
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
		localIdentityResolver: { resolveActiveLocalAuthIdentity: async () => null },
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
