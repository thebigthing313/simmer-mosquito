import { WORKOS_SESSION_COOKIE_NAME } from '@simmer-mosquito/auth';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { readSealedSession, writeSealedSession } from '../../auth-session-transport.js';

/**
 * The two transports a sealed session can travel on, and the asymmetry between
 * them.
 *
 * The read half is easy to eyeball. The write half is not: a rotated session
 * that only ever comes back as a `Set-Cookie` works forever for a browser and
 * fails for `apps/mobile` on a delay measured in whatever WorkOS's refresh
 * interval happens to be — long after the sign-in that looked fine. These cases
 * pin the header down so that failure cannot be reintroduced quietly.
 */

function app() {
	return new Hono()
		.get('/read', (context) => context.json({ sealed: readSealedSession(context) ?? null }))
		.get('/write', (context) => {
			writeSealedSession(context, 'sealed-value', { secure: false });
			return context.body(null, 204);
		});
}

const TOKEN_CLIENT_HEADERS = { 'x-simmer-client': 'token' };

describe('readSealedSession', () => {
	it('reads the session from the cookie', async () => {
		const response = await app().request('/read', {
			headers: { cookie: `${WORKOS_SESSION_COOKIE_NAME}=from-cookie` },
		});

		expect(await response.json()).toEqual({ sealed: 'from-cookie' });
	});

	it('reads the session from an Authorization bearer credential', async () => {
		const response = await app().request('/read', {
			headers: { authorization: 'Bearer from-bearer' },
		});

		expect(await response.json()).toEqual({ sealed: 'from-bearer' });
	});

	it('accepts the scheme case-insensitively, as RFC 7235 requires', async () => {
		const response = await app().request('/read', {
			headers: { authorization: 'bearer from-bearer' },
		});

		expect(await response.json()).toEqual({ sealed: 'from-bearer' });
	});

	it('prefers the cookie when a request somehow carries both', async () => {
		const response = await app().request('/read', {
			headers: {
				authorization: 'Bearer from-bearer',
				cookie: `${WORKOS_SESSION_COOKIE_NAME}=from-cookie`,
			},
		});

		expect(await response.json()).toEqual({ sealed: 'from-cookie' });
	});

	it('ignores a non-bearer Authorization header', async () => {
		const response = await app().request('/read', {
			headers: { authorization: 'Basic dXNlcjpwYXNz' },
		});

		expect(await response.json()).toEqual({ sealed: null });
	});

	it('reads an empty bearer credential as no session at all', async () => {
		const response = await app().request('/read', {
			headers: { authorization: 'Bearer   ' },
		});

		expect(await response.json()).toEqual({ sealed: null });
	});
});

describe('writeSealedSession', () => {
	it('always sets the httpOnly cookie', async () => {
		const response = await app().request('/write');

		const cookie = response.headers.get('set-cookie');
		expect(cookie).toContain(`${WORKOS_SESSION_COOKIE_NAME}=sealed-value`);
		expect(cookie).toContain('HttpOnly');
	});

	it('returns the rotated session in-band to a token client', async () => {
		const response = await app().request('/write', { headers: TOKEN_CLIENT_HEADERS });

		expect(response.headers.get('x-simmer-session')).toBe('sealed-value');
	});

	/*
	 * The reason the header is opt-in rather than unconditional. The web apps
	 * keep the sealed session in an httpOnly cookie precisely so page scripts
	 * cannot read it; echoing it into a readable response header for every caller
	 * would hand it back to any script on the page and make `httpOnly` decorative.
	 */
	it('withholds the header from a client that did not ask for it', async () => {
		const response = await app().request('/write');

		expect(response.headers.get('x-simmer-session')).toBeNull();
	});

	it('does nothing at all when there is no session to hand back', async () => {
		const bare = new Hono().get('/write', (context) => {
			writeSealedSession(context, undefined, { secure: false });
			return context.body(null, 204);
		});

		const response = await bare.request('/write', { headers: TOKEN_CLIENT_HEADERS });

		expect(response.headers.get('set-cookie')).toBeNull();
		expect(response.headers.get('x-simmer-session')).toBeNull();
	});
});
