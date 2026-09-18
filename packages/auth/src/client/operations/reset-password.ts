import type { AuthJsonPost } from '../create-auth-json-post.js';
import type { ResetPasswordOutcome } from '../outcomes.js';
import { readReason } from '../read-reason.js';

export async function resetPassword(
	post: AuthJsonPost,
	input: { readonly token: string; readonly newPassword: string },
): Promise<ResetPasswordOutcome> {
	const { data } = await post('/auth/reset-password', input);
	if (data.ok === true) {
		return { status: 'ok' };
	}

	if (data.status === 'weak_password') {
		return { status: 'weak_password', reason: readReason(data, 'Choose a stronger password.') };
	}

	if (data.status === 'invalid_token') {
		return { status: 'invalid_token' };
	}

	return { status: 'error', reason: readReason(data, 'Unable to reset your password.') };
}
