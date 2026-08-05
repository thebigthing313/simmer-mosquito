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

interface WorkOsErrorEntry {
	readonly code: string;
	readonly message?: string;
}

interface WorkOsExceptionInput {
	readonly code?: string;
	readonly errors?: readonly WorkOsErrorEntry[];
	readonly message?: string;
}

/**
 * The exceptions WorkOS actually throws, captured against a live environment by
 * `src/probe-reset-password.ts` (#54).
 *
 * These are transcriptions of that run rather than guesses, and the two that
 * matter were both previously wrong: a refused password is a **400**, and a
 * failed reset token is a **404**. Nothing in the reset flow is a 422 at all,
 * which is exactly what the mapping used to require.
 */
class BadRequestException extends Error {
	readonly status = 400;
	readonly code: string | undefined;
	readonly errors: readonly WorkOsErrorEntry[] | undefined;

	constructor({ code, errors, message }: WorkOsExceptionInput) {
		super(message ?? 'Bad request');
		this.name = 'BadRequestException';
		this.code = code;
		this.errors = errors;
	}
}

class NotFoundException extends Error {
	readonly status = 404;
	readonly code: string | undefined;

	constructor({ code, message }: WorkOsExceptionInput) {
		super(message ?? 'Not found');
		this.name = 'NotFoundException';
		this.code = code;
	}
}

/**
 * Kept although the reset flow never produced one: the mapping still accepts a
 * 422 in case WorkOS changes, and this is what would arrive if it did.
 *
 * Unlike the fixture it replaces, it carries `errors` as a property. The live
 * exceptions do — the old version modelled a constructor that rewrote the
 * message from the requirement codes, which is not what this endpoint sends.
 */
class UnprocessableEntityException extends Error {
	readonly status = 422;
	readonly code: string | undefined;
	readonly errors: readonly WorkOsErrorEntry[] | undefined;

	constructor({ code, errors, message }: WorkOsExceptionInput) {
		super(message ?? 'Unprocessable entity');
		this.name = 'UnprocessableEntityException';
		this.code = code;
		this.errors = errors;
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

	// Transcribed from the live run: password too short, on a valid token.
	it('reports a refused password as weak, in the words the user can act on', async () => {
		mockResetPassword.mockRejectedValue(
			new BadRequestException({
				code: 'password_reset_error',
				message: 'Could not reset password.',
				errors: [
					{
						code: 'password_too_short',
						message:
							'The provided password does not meet the minimum length requirements. Please try a password with 10 or more characters.',
					},
				],
			}),
		);

		const auth = createWorkOsAuth(config);

		// The top-level message is "Could not reset password.", which tells the
		// user nothing. The useful sentence is in `errors[]`.
		await expect(auth.resetPassword(input)).resolves.toEqual({
			status: 'weak_password',
			message:
				'The provided password does not meet the minimum length requirements. Please try a password with 10 or more characters.',
		});
	});

	it('joins every requirement when a password fails more than one', async () => {
		mockResetPassword.mockRejectedValue(
			new BadRequestException({
				code: 'password_reset_error',
				message: 'Could not reset password.',
				errors: [
					{ code: 'password_too_short', message: 'Too short.' },
					{ code: 'password_too_weak', message: 'Not strong enough.' },
				],
			}),
		);

		const auth = createWorkOsAuth(config);

		await expect(auth.resetPassword(input)).resolves.toEqual({
			status: 'weak_password',
			message: 'Too short. Not strong enough.',
		});
	});

	// The bug this whole exercise found. A refused password is a 400, and the
	// mapping used to require a 422 — so every real policy rejection fell through
	// to `invalid_token` and told the user their link had expired.
	it('does not read a refused password as an expired link', async () => {
		mockResetPassword.mockRejectedValue(
			new BadRequestException({
				code: 'password_reset_error',
				message: 'Could not reset password.',
				errors: [{ code: 'password_too_weak', message: 'Not strong enough.' }],
			}),
		);

		const auth = createWorkOsAuth(config);
		const result = await auth.resetPassword(input);

		expect(result.status).not.toBe('invalid_token');
	});

	// Both token failures observed — spent and malformed — are the same 404 with
	// the same code, so the user cannot tell which, and does not need to.
	it.each(['already-used', 'malformed'])('reports a %s token as an expired link', async () => {
		mockResetPassword.mockRejectedValue(
			new NotFoundException({
				code: 'password_reset_token_not_found',
				message: "Could not locate user with provided token: 'qYdC3AJiF6DWzZIujAgkf5nBb'",
			}),
		);

		const auth = createWorkOsAuth(config);

		await expect(auth.resetPassword(input)).resolves.toEqual({ status: 'invalid_token' });
	});

	// Not observed in the reset flow, but this is `createUser`/`updateUser`'s
	// code, and the two paths share `isPasswordRejection`.
	it('recognises the create/update strength code too', async () => {
		mockResetPassword.mockRejectedValue(
			new BadRequestException({
				code: 'password_strength_error',
				message: 'Password does not meet strength requirements.',
				errors: [{ code: 'password_too_weak', message: 'Not strong enough.' }],
			}),
		);

		const auth = createWorkOsAuth(config);
		const result = await auth.resetPassword(input);

		expect(result.status).toBe('weak_password');
	});

	// A 422 is no longer produced by this endpoint, but the mapping still accepts
	// one in case WorkOS changes — and a token-named 422 must still not read as a
	// password problem.
	it('keeps a token-named failure as an expired link whatever its status', async () => {
		mockResetPassword.mockRejectedValue(
			new UnprocessableEntityException({
				code: 'password_reset_token_expired',
				message: 'The password reset token has expired.',
			}),
		);

		const auth = createWorkOsAuth(config);

		await expect(auth.resetPassword(input)).resolves.toEqual({ status: 'invalid_token' });
	});

	it('keeps an unrelated failure as an invalid token', async () => {
		mockResetPassword.mockRejectedValue(
			new BadRequestException({ code: 'validation_error', message: 'Bad request.' }),
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
