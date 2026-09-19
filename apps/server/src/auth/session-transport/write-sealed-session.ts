import { WORKOS_SESSION_COOKIE_NAME } from '@simmer-mosquito/auth';
import type { Context } from 'hono';
import { setCookie } from 'hono/cookie';
import { isTokenClient } from './is-token-client.js';
import { SESSION_RESPONSE_HEADER } from './session-headers.js';

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type CookieContext = Parameters<typeof setCookie>[0];

/**
 * Hand a sealed session back to the client that will need it next. Always sets
 * the cookie, and echoes the value in a header only to a declared token client,
 * since emitting it to a browser would make `httpOnly` decorative (ADR 0016).
 */
export function writeSealedSession(
	context: Context,
	sealedSession: string | undefined,
	options: { readonly secure: boolean },
): void {
	if (sealedSession === undefined) {
		return;
	}

	setCookie(context as CookieContext, WORKOS_SESSION_COOKIE_NAME, sealedSession, {
		httpOnly: true,
		maxAge: SESSION_MAX_AGE_SECONDS,
		path: '/',
		sameSite: 'Lax',
		secure: options.secure,
	});

	if (isTokenClient(context)) {
		context.header(SESSION_RESPONSE_HEADER, sealedSession);
	}
}
