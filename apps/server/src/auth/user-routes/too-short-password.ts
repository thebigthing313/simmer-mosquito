import type { WeakPasswordBody } from '@simmer-mosquito/auth/browser';
import { weakPasswordBody } from './weak-password-body.js';

/** The length floor SIMMER checks before WorkOS is asked. */
const MIN_PASSWORD_LENGTH = 8;

/** The refusal for a password under the floor, or `null` when it clears it. */
export function tooShortPassword(password: string): WeakPasswordBody | null {
	return password.length < MIN_PASSWORD_LENGTH
		? weakPasswordBody(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
		: null;
}
