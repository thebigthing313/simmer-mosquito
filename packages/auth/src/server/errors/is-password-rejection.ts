import { isBadRequest } from './is-bad-request.js';
import { isNotFound } from './is-not-found.js';
import { isUnprocessable } from './is-unprocessable.js';
import { readErrorCode } from './read-error-code.js';
import { readPasswordIssueCodes } from './read-password-issue-codes.js';

/**
 * WorkOS's codes for a password refused by policy, observed live (#54): both
 * arrive as a 400 `BadRequestException`.
 */
const PASSWORD_POLICY_CODES = new Set(['password_reset_error', 'password_strength_error']);

/**
 * Whether WorkOS refused a password on policy grounds. A refused password is a
 * 400; a spent or unknown reset token is a 404 and must never read as one.
 */
export function isPasswordRejection(error: unknown): boolean {
	if (isNotFound(error)) {
		return false;
	}
	if (!isBadRequest(error) && !isUnprocessable(error)) {
		return false;
	}

	const code = (readErrorCode(error) ?? '').toLowerCase();
	if (code.includes('token')) {
		return false;
	}
	return PASSWORD_POLICY_CODES.has(code) || readPasswordIssueCodes(error).length > 0;
}
