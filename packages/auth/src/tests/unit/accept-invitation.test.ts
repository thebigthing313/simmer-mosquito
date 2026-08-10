import { beforeEach, describe, expect, it, vi } from 'vitest';

// Controllable stand-ins for the `workos.userManagement` calls the invitation
// acceptance flow makes. (Prefixed `mock` so Vitest's hoisted factory may
// reference them.)
type AnyFn = (...args: never[]) => Promise<unknown>;
let mockListUsers: ReturnType<typeof vi.fn<AnyFn>>;
let mockCreateUser: ReturnType<typeof vi.fn<AnyFn>>;
let mockUpdateUser: ReturnType<typeof vi.fn<AnyFn>>;
let mockAuthenticate: ReturnType<typeof vi.fn<AnyFn>>;

vi.mock('@workos-inc/node', () => ({
	WorkOS: class {
		userManagement = {
			listUsers: (...args: never[]) => mockListUsers(...args),
			createUser: (...args: never[]) => mockCreateUser(...args),
			updateUser: (...args: never[]) => mockUpdateUser(...args),
			authenticateWithPassword: (...args: never[]) => mockAuthenticate(...args),
		};
	},
}));

const { createWorkOsAuth } = await import('../../index.js');

/** Mirrors the real `@workos-inc/node` `OauthException` (see password-auth-failure.test.ts). */
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

const input = {
	invitationToken: 'itok_123',
	email: 'invitee@example.test',
	password: 'sup3rsecret',
	firstName: 'Ivy',
	lastName: 'Invitee',
};

const authenticatedResponse = {
	user: { id: 'user_1', email: input.email, emailVerified: true },
	organizationId: 'org_1',
	sealedSession: 'sealed',
};

describe('acceptInvitationWithPassword', () => {
	beforeEach(() => {
		mockListUsers = vi.fn<AnyFn>().mockResolvedValue({ data: [] });
		mockCreateUser = vi.fn<AnyFn>().mockResolvedValue({ id: 'user_1' });
		mockUpdateUser = vi.fn<AnyFn>().mockResolvedValue({ id: 'user_1' });
		mockAuthenticate = vi.fn<AnyFn>().mockResolvedValue(authenticatedResponse);
	});

	it('verifies the email on the invitation-provisioned user so acceptance is one step', async () => {
		// WorkOS creates a passwordless, unverified user when the invitation is
		// sent. Leaving it unverified made the authenticate call below demand a
		// code the acceptance form cannot collect (issue #43).
		mockListUsers.mockResolvedValue({
			data: [{ id: 'user_1', email: input.email, lastSignInAt: null }],
		});

		const auth = createWorkOsAuth(config);
		const result = await auth.acceptInvitationWithPassword(input);

		expect(mockUpdateUser).toHaveBeenCalledWith(
			expect.objectContaining({ userId: 'user_1', password: input.password, emailVerified: true }),
		);
		expect(mockCreateUser).not.toHaveBeenCalled();
		expect(mockAuthenticate).toHaveBeenCalledWith(
			expect.objectContaining({ invitationToken: input.invitationToken }),
		);
		expect(result).toMatchObject({ status: 'authenticated' });
	});

	it('creates an already-verified user when the invitee has no account yet', async () => {
		const auth = createWorkOsAuth(config);
		const result = await auth.acceptInvitationWithPassword(input);

		expect(mockCreateUser).toHaveBeenCalledWith(
			expect.objectContaining({ email: input.email, emailVerified: true }),
		);
		expect(result).toMatchObject({ status: 'authenticated' });
	});

	it('sends an invitee who already signed in to the sign-in flow', async () => {
		mockListUsers.mockResolvedValue({
			data: [{ id: 'user_1', email: input.email, lastSignInAt: '2026-08-01T00:00:00.000Z' }],
		});

		const auth = createWorkOsAuth(config);
		const result = await auth.acceptInvitationWithPassword(input);

		expect(result).toEqual({ status: 'account_exists' });
		expect(mockUpdateUser).not.toHaveBeenCalled();
		expect(mockAuthenticate).not.toHaveBeenCalled();
	});

	it('reports a spent or revoked token as an invitation problem, not bad credentials', async () => {
		mockAuthenticate.mockRejectedValue(
			new OauthException(400, {
				error: 'invitation_invalid',
				error_description: 'The invitation is not found, expired, or has already been used.',
			}),
		);

		const auth = createWorkOsAuth(config);
		const result = await auth.acceptInvitationWithPassword(input);

		expect(result).toEqual({ status: 'invalid_invitation' });
	});

	it('hands back a verification challenge instead of throwing', async () => {
		mockAuthenticate.mockRejectedValue(
			new OauthException(403, {
				error: 'email_verification_required',
				pending_authentication_token: 'pat_123',
				email: input.email,
			}),
		);

		const auth = createWorkOsAuth(config);
		const result = await auth.acceptInvitationWithPassword(input);

		expect(result).toEqual({
			status: 'verification_required',
			pendingAuthenticationToken: 'pat_123',
			email: input.email,
		});
	});

	it('surfaces bad credentials without leaking the reason', async () => {
		mockAuthenticate.mockRejectedValue(
			new OauthException(400, { error: 'invalid_credentials', error_description: 'Invalid.' }),
		);

		const auth = createWorkOsAuth(config);
		const result = await auth.acceptInvitationWithPassword(input);

		expect(result).toEqual({ status: 'invalid_credentials' });
	});
});
