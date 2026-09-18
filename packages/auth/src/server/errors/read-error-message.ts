import { readErrorEntries } from './read-error-entries.js';

/**
 * The message to show for a refused password. The actionable text is in
 * `errors[]`; the top-level message only says the call failed.
 */
export function readErrorMessage(error: unknown): string {
	const issues = readErrorEntries(error)
		.map((entry) => (typeof entry.message === 'string' ? entry.message.trim() : ''))
		.filter((message) => message !== '');
	if (issues.length > 0) {
		return issues.join(' ');
	}

	if (error instanceof Error && error.message.trim() !== '') {
		return error.message;
	}

	return 'Password does not meet the requirements.';
}
