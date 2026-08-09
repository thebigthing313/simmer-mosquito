import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkOsAuth } from './index.js';

const refresh = vi.hoisted(() => vi.fn());
const loadSealedSession = vi.hoisted(() => vi.fn(() => ({ refresh })));

vi.mock('@workos-inc/node', () => ({
	WorkOS: class {
		userManagement = { loadSealedSession };
	},
}));

/**
 * The shape WorkOS throws: its exceptions carry the HTTP status, and
 * `OauthException` also names the reason in `error`.
 */
function workosError(status: number, code?: string): Error {
	return Object.assign(new Error(code ?? 'workos'), {
		status,
		...(code === undefined ? {} : { error: code }),
	});
}

const auth = createWorkOsAuth({
	apiKey: 'sk_test',
	clientId: 'client_test',
	cookiePassword: 'a'.repeat(32),
	redirectUri: 'https://localhost/callback',
});

async function switchTo(organizationId = 'org_target') {
	return auth.switchOrganization({ sealedSession: 'sealed', workosOrganizationId: organizationId });
}

describe('switchOrganization', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('re-seals the session when WorkOS allows the switch', async () => {
		refresh.mockResolvedValue({
			authenticated: true,
			user: { id: 'user_1', email: 'operator@example.test' },
			organizationId: 'org_target',
			sessionId: 'session_1',
			sealedSession: 'resealed',
		});

		await expect(switchTo()).resolves.toMatchObject({
			authenticated: true,
			workosOrganizationId: 'org_target',
			sealedSession: 'resealed',
		});
	});

	// The case the endpoint exists to produce. The SDK returns a refusal for only
	// three OAuth errors and rethrows the rest, so "not a member of that
	// organization" arrives as a throw — and used to leave as a 500.
	it('reads a thrown 4xx as the organization refusing', async () => {
		refresh.mockRejectedValue(workosError(401, 'invalid_grant'));

		await expect(switchTo()).resolves.toEqual({
			authenticated: false,
			reason: 'invalid_grant',
		});
	});

	it('names the refusal generically when the exception carries no code', async () => {
		refresh.mockRejectedValue(workosError(404));

		await expect(switchTo()).resolves.toEqual({
			authenticated: false,
			reason: 'organization_switch_refused',
		});
	});

	// Could not ask is not the same as being told no. Reporting either of these
	// as a refusal would tell an operator they lack access they may well have.
	it('rethrows a server error rather than calling it a refusal', async () => {
		refresh.mockRejectedValue(workosError(503));

		await expect(switchTo()).rejects.toThrow();
	});

	it('rethrows a rate limit, which means ask again rather than no', async () => {
		refresh.mockRejectedValue(workosError(429, 'too_many_requests'));

		await expect(switchTo()).rejects.toThrow();
	});

	it('rethrows an error that carries no status at all', async () => {
		refresh.mockRejectedValue(new Error('socket hang up'));

		await expect(switchTo()).rejects.toThrow('socket hang up');
	});

	it('refuses without a round trip when there is no session cookie', async () => {
		await expect(
			auth.switchOrganization({ sealedSession: undefined, workosOrganizationId: 'org_target' }),
		).resolves.toEqual({ authenticated: false, reason: 'no_session_cookie_provided' });
		expect(loadSealedSession).not.toHaveBeenCalled();
	});
});
