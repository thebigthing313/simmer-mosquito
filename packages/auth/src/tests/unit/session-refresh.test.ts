/**
 * Who is allowed to spend the session's refresh token.
 *
 * A WorkOS refresh token is single use. Every authenticated route used to be
 * able to spend it, and the browser issues several requests at once — the
 * `organizations` and `profiles` shape streams go out milliseconds apart on
 * every poll cycle — so the same token was spent more than once and the session
 * died about a minute after signing in (#298).
 *
 * These pin the rule that replaced it: refreshing is a decision the caller
 * states, and only `/auth/me` states it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkOsAuth, SESSION_REFRESH_REQUIRED } from '../../index.js';

const authenticate = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
const loadSealedSession = vi.hoisted(() => vi.fn(() => ({ authenticate, refresh })));

vi.mock('@workos-inc/node', () => ({
	WorkOS: class {
		userManagement = { loadSealedSession };
	},
}));

const auth = createWorkOsAuth({
	apiKey: 'sk_test',
	clientId: 'client_test',
	cookiePassword: 'a'.repeat(32),
	redirectUri: 'https://localhost/callback',
});

const workosUser = { id: 'user_1', email: 'field@example.test' };

describe('authenticateSession', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('spends nothing while the access token is still good', async () => {
		authenticate.mockResolvedValue({
			authenticated: true,
			user: workosUser,
			organizationId: 'org_1',
			sessionId: 'session_1',
			role: 'manager',
		});

		await expect(auth.authenticateSession('sealed', { mayRefresh: false })).resolves.toMatchObject({
			authenticated: true,
			workosOrganizationId: 'org_1',
		});
		expect(refresh).not.toHaveBeenCalled();
	});

	it('refuses an expired access token rather than refreshing, when it may not refresh', async () => {
		authenticate.mockResolvedValue({ authenticated: false, reason: 'invalid_jwt' });

		await expect(auth.authenticateSession('sealed', { mayRefresh: false })).resolves.toEqual({
			authenticated: false,
			reason: SESSION_REFRESH_REQUIRED,
		});
		// The whole point: the token is still spendable, and the client will spend
		// it at `/auth/me` instead.
		expect(refresh).not.toHaveBeenCalled();
	});

	it('refreshes and hands back the rotated session, when it may refresh', async () => {
		authenticate.mockResolvedValue({ authenticated: false, reason: 'invalid_jwt' });
		refresh.mockResolvedValue({
			authenticated: true,
			user: workosUser,
			organizationId: 'org_1',
			sessionId: 'session_2',
			role: 'manager',
			sealedSession: 'rotated',
		});

		await expect(auth.authenticateSession('sealed', { mayRefresh: true })).resolves.toMatchObject({
			authenticated: true,
			sealedSession: 'rotated',
		});
		expect(refresh).toHaveBeenCalledOnce();
	});

	it('reports a genuinely dead session as dead rather than as needing a refresh', async () => {
		// The distinction the client acts on. `session_refresh_required` means ask
		// `/auth/me` and retry; anything else means the session is gone and asking
		// again would be a loop.
		authenticate.mockResolvedValue({ authenticated: false, reason: 'invalid_jwt' });
		refresh.mockResolvedValue({ authenticated: false, reason: 'session_expired' });

		await expect(auth.authenticateSession('sealed', { mayRefresh: true })).resolves.toEqual({
			authenticated: false,
			reason: 'session_expired',
		});
	});

	it('needs no session loaded at all to refuse an empty cookie', async () => {
		await expect(auth.authenticateSession(undefined, { mayRefresh: true })).resolves.toEqual({
			authenticated: false,
			reason: 'no_session_cookie_provided',
		});
		expect(loadSealedSession).not.toHaveBeenCalled();
	});
});
