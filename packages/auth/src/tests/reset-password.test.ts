import { beforeEach, describe, expect, it, vi } from 'vitest';

// Controllable stand-in for workos.userManagement.resetPassword.
// (Prefixed `mock` so Vitest's hoisted factory is allowed to reference it.)
type ResetFn = (...args: unknown[]) => Promise<unknown>;
let mockResetPassword: ReturnType<typeof vi.fn<ResetFn>>;

vi.mock('@workos-inc/node', () => ({
	WorkOS: class {
		userManagement = {
			resetPassword: (...args: unknown[]) => mockResetPassword(...args),
		};
	},
}));

const { createWorkOsAuth } = await import('../index.js');

/**
 * Mirrors the real `@workos-inc/node` `UnprocessableEntityException`, including
 * the constructor's message rewrite: a 422 carrying `errors` reports the
 * per-requirement codes as its message rather than the top-level `message`.
 */
class UnprocessableEntityException extends Error {
	readonly status = 422;
	readonly code: string | undefined;

	constructor({
		code,
		errors,
		message,
	}: {
		readonly code?: string;
		readonly errors?: readonly { readonly code: string }[];
		readonly message?: string;
	}) {
		super(message ?? 'Unprocessable entity');
		this.name = 'UnprocessableEntityException';
		this.code = code;
		if (errors !== undefined) {
			this.message = `The following ${errors.length === 1 ? 'requirement' : 'requirements'} must be met:\n${errors
				.map((entry) => `\t${entry.code}\n`)
				.join('')}`;
		}
	}
}

const config = {
	apiKey: 'sk_test',
	clientId: 'client_test',
	cookiePassword: 'x'.repeat(32),
	redirectUri: 'https://app.example.com/auth/callback',
};

const input = { token: 'rtok_123', newPassword: 'sup3rsecret' };

describe('resetPassword failure mapping', () => {
	beforeEach(() => {
		mockResetPassword = vi.fn<ResetFn>();
	});

	it('reports a policy rejection as a weak password, in WorkOS words', async () => {
		mockResetPassword.mockRejectedValue(
			new UnprocessableEntityException({
				code: 'password_strength_error',
				message: 'Password has been found in an online data breach.',
			}),
		);

		const auth = createWorkOsAuth(config);

		await expect(auth.resetPassword(input)).resolves.toEqual({
			status: 'weak_password',
			message: 'Password has been found in an online data breach.',
		});
	});

	it('reads the requirement codes a 422 carries in place of its message', async () => {
		mockResetPassword.mockRejectedValue(
			new UnprocessableEntityException({ errors: [{ code: 'password_too_short' }] }),
		);

		const auth = createWorkOsAuth(config);
		const result = await auth.resetPassword(input);

		expect(result.status).toBe('weak_password');
	});

	// The regression this mapping is most likely to cause: reset-token failures
	// are themselves named `password_reset_token_*`, so a "does it mention a
	// password" test answers yes to a spent link and sends the user off to invent
	// a new password when the link is what expired.
	it('keeps a spent reset token as an expired link, not a refused password', async () => {
		mockResetPassword.mockRejectedValue(
			new UnprocessableEntityException({
				code: 'password_reset_token_expired',
				message: 'The password reset token has expired.',
			}),
		);

		const auth = createWorkOsAuth(config);

		await expect(auth.resetPassword(input)).resolves.toEqual({ status: 'invalid_token' });
	});

	it('keeps an unrelated 422 as an invalid token', async () => {
		mockResetPassword.mockRejectedValue(
			new UnprocessableEntityException({ code: 'validation_error', message: 'Unprocessable.' }),
		);

		const auth = createWorkOsAuth(config);

		await expect(auth.resetPassword(input)).resolves.toEqual({ status: 'invalid_token' });
	});

	it('passes a successful reset through', async () => {
		mockResetPassword.mockResolvedValue(undefined);

		const auth = createWorkOsAuth(config);

		await expect(auth.resetPassword(input)).resolves.toEqual({ status: 'ok' });
	});
});
