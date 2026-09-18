import { WORKOS_SESSION_COOKIE_NAME } from '@simmer-mosquito/auth';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';

const BEARER_PREFIX = 'bearer ';

/**
 * The sealed session this request presents, from either transport (ADR 0016).
 * Cookie first, so a browser that also sends an `Authorization` header is
 * still read as the browser it is.
 */
export function readSealedSession(context: Context): string | undefined {
	const cookie = getCookie(context, WORKOS_SESSION_COOKIE_NAME);
	if (cookie !== undefined && cookie !== '') {
		return cookie;
	}

	const authorization = context.req.header('authorization');
	if (authorization === undefined || !authorization.toLowerCase().startsWith(BEARER_PREFIX)) {
		return undefined;
	}

	const token = authorization.slice(BEARER_PREFIX.length).trim();
	return token === '' ? undefined : token;
}
