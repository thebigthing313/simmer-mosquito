import { classifyWorkOsFailure } from '../errors/classify-workos-failure.js';
import type { ResetPasswordResult } from '../password-auth-types.js';
import type { WorkOsAuthContext } from '../workos-auth-context.js';

/** A rejected password is told apart from a spent token, so each gets its own fix. */
export async function resetPassword(
	context: WorkOsAuthContext,
	input: { readonly token: string; readonly newPassword: string },
): Promise<ResetPasswordResult> {
	try {
		await context.workos.userManagement.resetPassword({
			token: input.token,
			newPassword: input.newPassword,
		});
		return { status: 'ok' };
	} catch (error) {
		const failure = classifyWorkOsFailure(error);
		switch (failure.kind) {
			case 'password_policy':
				return { status: 'weak_password', message: failure.message };
			case 'not_found':
			case 'unprocessable':
			case 'bad_request':
				return { status: 'invalid_token' };
			default:
				throw error;
		}
	}
}
