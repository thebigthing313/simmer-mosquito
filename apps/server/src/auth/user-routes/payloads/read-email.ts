import { readNonEmptyString } from './read-non-empty-string.js';

export function readEmail(value: unknown): string | null {
	const text = readNonEmptyString(value);
	if (text === null || !text.includes('@')) {
		return null;
	}

	return text.toLowerCase();
}
