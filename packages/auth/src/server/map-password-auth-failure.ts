import { errorStatus } from './errors/error-status.js';
import { isOauthException } from './errors/is-oauth-exception.js';
import { readErrorCode } from './errors/read-error-code.js';
import type { PasswordAuthResult } from './password-auth-types.js';
import { readAuthChallenge } from './read-auth-challenge.js';

/**
 * A rejected password authentication as a challenge or `invalid_credentials`.
 * Every non-challenge rejection reads as invalid credentials so no reason
 * leaks; anything unrecognized is rethrown.
 */
export function mapPasswordAuthFailure(
	error: unknown,
	fallbackEmail: string,
): Exclude<PasswordAuthResult, { status: 'authenticated' }> {
	const challenge = readAuthChallenge(error, fallbackEmail);
	if (challenge !== null) {
		return challenge;
	}

	if (
		isOauthException(error) ||
		readErrorCode(error) === 'invalid_credentials' ||
		errorStatus(error) === 401
	) {
		return { status: 'invalid_credentials' };
	}

	throw error;
}
