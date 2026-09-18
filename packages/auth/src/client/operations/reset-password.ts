import type { AuthJsonPost } from '../create-auth-json-post.js';
import type { ResetPasswordOutcome } from '../outcomes.js';
import { readAuthOutcome } from '../read-auth-outcome.js';
import { weakPasswordOutcome } from '../weak-password-outcome.js';
import type { ResetPasswordBody } from '../wire.js';

export async function resetPassword(
	post: AuthJsonPost,
	input: { readonly token: string; readonly newPassword: string },
): Promise<ResetPasswordOutcome> {
	return readAuthOutcome<ResetPasswordBody, ResetPasswordOutcome>(
		await post('/auth/reset-password', input),
		{
			ok: () => ({ status: 'ok' }),
			refused: {
				weak_password: weakPasswordOutcome,
				invalid_token: () => ({ status: 'invalid_token' }),
			},
			fallback: 'Unable to reset your password.',
		},
	);
}
