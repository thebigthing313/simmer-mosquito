import { SESSION_CLIENT_HEADER, TOKEN_CLIENT } from './session-headers.js';
import type { SessionTransport } from './session-transport.js';

/**
 * ADR 0016's outgoing headers for a token client, or nothing for a browser,
 * whose httpOnly cookie carries the session and must not be echoed in a header.
 */
export async function credentialHeaders(
	session: SessionTransport | null,
): Promise<Record<string, string>> {
	if (session === null) {
		return {};
	}

	const credential = await session.read();
	return {
		[SESSION_CLIENT_HEADER]: TOKEN_CLIENT,
		...(credential === null ? {} : { authorization: `Bearer ${credential}` }),
	};
}
