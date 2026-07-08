import { beforeEach, describe, expect, it, vi } from 'vitest';

// Controllable stand-in for workos.userManagement.authenticateWithPassword.
// (Prefixed `mock` so Vitest's hoisted factory is allowed to reference it.)
type AuthenticateFn = (...args: unknown[]) => Promise<unknown>;
let mockAuthenticate: ReturnType<typeof vi.fn<AuthenticateFn>>;

vi.mock('@workos-inc/node', () => ({
	WorkOS: class {
		userManagement = {
			authenticateWithPassword: (...args: unknown[]) => mockAuthenticate(...args),
		};
	},
}));

const { createWorkOsAuth } = await import('../index.js');

/**
 * Mirrors the real `@workos-inc/node` `OauthException`: `name === 'OauthException'`,
 * a numeric `status`, and the machine code carried in `rawData.error` (NOT `code`).
 * This is the exact shape a live `authenticateWithPassword` throws — captured by
 * calling the SDK directly against the SIMMER WorkOS environment.
 */
class OauthException extends Error {
	readonly status: number;
	readonly rawData: Record<string, unknown>;

	constructor(status: number, rawData: Record<string, unknown>) {
		super(typeof rawData.error === 'string' ? rawData.error : 'oauth error');
		this.name = 'OauthException';
		this.status = status;
		this.rawData = rawData;
	}
}

const config = {
	apiKey: 'sk_test',
	clientId: 'client_test',
	cookiePassword: 'x'.repeat(32),
	redirectUri: 'https://app.example.com/auth/callback',
};

describe('signInWithPassword failure mapping (real WorkOS OauthException shape)', () => {
	beforeEach(() => {
		mockAuthenticate = vi.fn<AuthenticateFn>();
	});

	it('maps invalid_credentials (code in rawData.error, status 400) to invalid_credentials', async () => {
		mockAuthenticate.mockRejectedValue(
			new OauthException(400, {
				error: 'invalid_credentials',
				error_description: 'Invalid credentials.',
			}),
		);

		const auth = createWorkOsAuth(config);
		const result = await auth.signInWithPassword({ email: 'a@b.com', password: 'nope' });

		expect(result).toEqual({ status: 'invalid_credentials' });
	});

	it('maps sso_required to invalid_credentials rather than throwing (never a 500)', async () => {
		mockAuthenticate.mockRejectedValue(
			new OauthException(400, {
				error: 'sso_required',
				error_description: 'User must authenticate using one of the matching connections.',
				connection_ids: ['conn_1'],
			}),
		);

		const auth = createWorkOsAuth(config);
		const result = await auth.signInWithPassword({ email: 'a@b.com', password: 'nope' });

		expect(result).toEqual({ status: 'invalid_credentials' });
	});

	it('surfaces email_verification_required as a verification challenge', async () => {
		mockAuthenticate.mockRejectedValue(
			new OauthException(403, {
				error: 'email_verification_required',
				pending_authentication_token: 'pat_123',
				email: 'user@b.com',
			}),
		);

		const auth = createWorkOsAuth(config);
		const result = await auth.signInWithPassword({ email: 'a@b.com', password: 'pw' });

		expect(result).toEqual({
			status: 'verification_required',
			pendingAuthenticationToken: 'pat_123',
			email: 'user@b.com',
		});
	});

	it('surfaces organization_selection_required with the org list', async () => {
		mockAuthenticate.mockRejectedValue(
			new OauthException(403, {
				error: 'organization_selection_required',
				pending_authentication_token: 'pat_456',
				organizations: [
					{ id: 'org_1', name: 'Alpha' },
					{ id: 'org_2', name: 'Beta' },
				],
			}),
		);

		const auth = createWorkOsAuth(config);
		const result = await auth.signInWithPassword({ email: 'a@b.com', password: 'pw' });

		expect(result).toEqual({
			status: 'organization_selection_required',
			pendingAuthenticationToken: 'pat_456',
			organizations: [
				{ id: 'org_1', name: 'Alpha' },
				{ id: 'org_2', name: 'Beta' },
			],
		});
	});
});
