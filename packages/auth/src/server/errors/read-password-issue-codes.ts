import { readErrorEntries } from './read-error-entries.js';

/** The per-requirement codes on a refused password, such as `password_too_short`. */
export function readPasswordIssueCodes(error: unknown): readonly string[] {
	return readErrorEntries(error)
		.map((entry) => (typeof entry.code === 'string' ? entry.code : ''))
		.filter((code) => code.startsWith('password_'));
}
