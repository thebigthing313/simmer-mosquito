import type { AuthChallenge } from '../../client/wire.js';
import { readAuthChallenge } from '../read-auth-challenge.js';
import { errorName } from './error-name.js';
import { errorStatus } from './error-status.js';
import { readErrorCode } from './read-error-code.js';
import { readErrorEntries } from './read-error-entries.js';
import { readErrorMessage } from './read-error-message.js';

/**
 * What a thrown WorkOS error means, read once. A method switches on `kind` for
 * the arms it answers and rethrows the rest.
 */
export type WorkOsFailure =
	| { readonly kind: 'invitation_invalid' }
	| { readonly kind: 'challenge'; readonly challenge: AuthChallenge }
	| { readonly kind: 'invalid_credentials' }
	| { readonly kind: 'email_taken' }
	| { readonly kind: 'password_policy'; readonly message: string }
	| { readonly kind: 'not_found' }
	| { readonly kind: 'unprocessable' }
	| { readonly kind: 'bad_request' }
	| { readonly kind: 'unrecognized' };

/**
 * WorkOS's codes for a password refused by policy, observed live (#54): both
 * arrive as a 400 `BadRequestException`.
 */
const PASSWORD_POLICY_CODES = new Set(['password_reset_error', 'password_strength_error']);

/**
 * Most specific rule first. A refused password is a 400 and a spent reset token
 * is a 404, so the status decides between them before any code is read, and a
 * code naming a token is never a password refusal.
 */
export function classifyWorkOsFailure(
	error: unknown,
	options: { readonly fallbackEmail: string } = { fallbackEmail: '' },
): WorkOsFailure {
	const code = readErrorCode(error);
	if (code === 'invitation_invalid') {
		return { kind: 'invitation_invalid' };
	}

	const challenge = readAuthChallenge(error, options.fallbackEmail);
	if (challenge !== null) {
		return { kind: 'challenge', challenge };
	}

	if (isOauthException(error) || code === 'invalid_credentials' || errorStatus(error) === 401) {
		return { kind: 'invalid_credentials' };
	}

	if (code === 'email_not_available' || code === 'email_taken') {
		return { kind: 'email_taken' };
	}

	const notFound = errorName(error) === 'NotFoundException' || errorStatus(error) === 404;
	const unprocessable =
		errorName(error) === 'UnprocessableEntityException' || errorStatus(error) === 422;
	const badRequest = errorName(error) === 'BadRequestException' || errorStatus(error) === 400;

	if (!notFound && (badRequest || unprocessable) && isPasswordRefusal(error, code)) {
		return { kind: 'password_policy', message: readErrorMessage(error) };
	}

	if (notFound) {
		return { kind: 'not_found' };
	}

	if (unprocessable) {
		return { kind: 'unprocessable' };
	}

	if (badRequest) {
		return { kind: 'bad_request' };
	}

	return { kind: 'unrecognized' };
}

/** The observed codes, or a per-requirement code such as `password_too_short` in `errors[]`. */
function isPasswordRefusal(error: unknown, code: string | undefined): boolean {
	const lowered = (code ?? '').toLowerCase();
	if (lowered.includes('token')) {
		return false;
	}

	return (
		PASSWORD_POLICY_CODES.has(lowered) ||
		readErrorEntries(error).some(
			(entry) => typeof entry.code === 'string' && entry.code.startsWith('password_'),
		)
	);
}

/** A WorkOS OAuth-style authentication rejection: wrong password, sso_required, mfa. */
function isOauthException(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		(error as { readonly name?: unknown }).name === 'OauthException'
	);
}
