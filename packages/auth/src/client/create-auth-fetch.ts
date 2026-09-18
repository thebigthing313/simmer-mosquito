import { addressOn } from './address-on.js';
import { carriedHeaders } from './carried-headers.js';
import { credentialHeaders } from './credential-headers.js';
import type { AuthFetch, FetchInit, FetchInput, FetchResponse } from './fetch-types.js';
import { headerEntries } from './header-entries.js';
import { SESSION_RESPONSE_HEADER } from './session-headers.js';
import type { SessionTransport } from './session-transport.js';

/**
 * The client's `fetch`: every request goes out with whichever credential the
 * client carries, and a rotated sealed session the server hands back in a header
 * is written to the transport, so rotation is invisible to callers. Headers
 * merge last-wins: the default, then the request's, then the caller's, then the
 * credential headers, which no caller may forge.
 */
export function createAuthFetch(serverUrl: string, session: SessionTransport | null): AuthFetch {
	return async (input: FetchInput, init: FetchInit = {}): Promise<FetchResponse> => {
		const response = await fetch(addressOn(serverUrl, input), {
			...init,
			// session-credential-ignore: this is the token transport itself, which every caller sends through.
			credentials: 'include',
			headers: {
				accept: 'application/json',
				...carriedHeaders(input),
				...headerEntries(init.headers),
				...(await credentialHeaders(session)),
			},
		});

		const rotated = response.headers.get(SESSION_RESPONSE_HEADER);
		if (session !== null && rotated !== null && rotated !== '') {
			await session.write(rotated);
		}

		return response;
	};
}
