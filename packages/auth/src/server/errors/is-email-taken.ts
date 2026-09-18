import { readErrorCode } from './read-error-code.js';

export function isEmailTaken(error: unknown): boolean {
	const code = readErrorCode(error);
	return code === 'email_not_available' || code === 'email_taken';
}
