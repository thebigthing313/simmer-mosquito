import type { FetchInput } from './fetch-types.js';

/** A string is already addressed when it names a scheme. */
const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:/i;

/**
 * A path starting with `/` is resolved against `serverUrl`; a whole URL or a
 * `Request` passes through untouched, which is what lets `packages/sync`
 * install this client's `fetch`. Anything else is refused, because `fetch`
 * would resolve it against the SPA's document and answer a page of HTML as an
 * empty result set.
 */
export function addressOn(serverUrl: string, input: FetchInput): FetchInput {
	if (typeof input !== 'string' || ABSOLUTE_URL.test(input)) {
		return input;
	}

	if (input.startsWith('/')) {
		return `${serverUrl}${input}`;
	}

	throw new Error(`Cannot address "${input}": give a path starting with "/" or a whole URL.`);
}
