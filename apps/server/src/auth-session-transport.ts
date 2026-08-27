/**
 * How a client carries its sealed WorkOS session, for the two kinds of client
 * SIMMER has.
 *
 * The web apps carry it in an httpOnly cookie and never touch it. `apps/mobile`
 * cannot: React Native has no cookie jar worth relying on, and
 * `docs/architecture.md` already reserves a SecureStore-backed session for the
 * field app. So the same sealed session travels as an `Authorization: Bearer`
 * credential instead, and this module is the one place that knows a request may
 * present it either way.
 *
 * The subtle half is the *return* trip. `resolveAuthContext` hands back a
 * refreshed sealed session whenever WorkOS rotates one, and every caller
 * currently answers that by writing a cookie — which a bearer client will never
 * see. Left alone, a mobile session would work perfectly until its first
 * rotation and then fail, on a delay, with nothing at the failure site to
 * explain it. {@link writeSealedSession} closes that loop by also emitting the
 * rotated value as a response header.
 *
 * That header is emitted *only* when the request declared itself a token
 * client. Emitting it unconditionally would hand the sealed session to any
 * same-origin script in the web app, which is exactly what `httpOnly` is for.
 */

import { WORKOS_SESSION_COOKIE_NAME } from '@simmer-mosquito/auth';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

/** A request declares itself a token client by sending `x-simmer-client: token`. */
const SESSION_CLIENT_HEADER = 'x-simmer-client';
const TOKEN_CLIENT = 'token';

/** Where a rotated sealed session is returned to a token client. */
export const SESSION_RESPONSE_HEADER = 'x-simmer-session';

const BEARER_PREFIX = 'bearer ';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type CookieContext = Parameters<typeof setCookie>[0];

/**
 * The sealed session this request presents, from either transport.
 *
 * Cookie first: a browser that also happens to send an `Authorization` header
 * (a proxy, a debugging tool) should still be read as the browser it is.
 */
export function readSealedSession(context: Context): string | undefined {
	const cookie = getCookie(context, WORKOS_SESSION_COOKIE_NAME);
	if (cookie !== undefined && cookie !== '') {
		return cookie;
	}

	const authorization = context.req.header('authorization');
	if (authorization === undefined) {
		return undefined;
	}

	if (!authorization.toLowerCase().startsWith(BEARER_PREFIX)) {
		return undefined;
	}

	const token = authorization.slice(BEARER_PREFIX.length).trim();
	return token === '' ? undefined : token;
}

/** Whether this caller wants its session handed back in-band rather than as a cookie. */
function isTokenClient(context: Context): boolean {
	return context.req.header(SESSION_CLIENT_HEADER)?.trim().toLowerCase() === TOKEN_CLIENT;
}

/**
 * Hand a sealed session back to the client that will need it next.
 *
 * Always sets the cookie — the web apps depend on it and a token client simply
 * ignores it — and additionally echoes the value to a token client, which has
 * nowhere else to learn that its credential was rotated.
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
