import type { FetchInput } from './fetch-types.js';
import { headerEntries } from './header-entries.js';

/** The headers an already-built `Request` brought with it. */
export function carriedHeaders(input: FetchInput): Record<string, string> {
	return typeof input === 'object' && input !== null && 'headers' in input
		? headerEntries(input.headers)
		: {};
}
