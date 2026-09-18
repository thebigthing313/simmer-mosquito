import { isBadRequest } from '../errors/is-bad-request.js';
import { isNotFound } from '../errors/is-not-found.js';
import { isPasswordRejection } from '../errors/is-password-rejection.js';
import { isUnprocessable } from '../errors/is-unprocessable.js';
import { readErrorMessage } from '../errors/read-error-message.js';
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
		if (isPasswordRejection(error)) {
			return { status: 'weak_password', message: readErrorMessage(error) };
		}

		if (isNotFound(error) || isUnprocessable(error) || isBadRequest(error)) {
			return { status: 'invalid_token' };
		}

		throw error;
	}
}
