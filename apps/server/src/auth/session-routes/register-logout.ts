import { WORKOS_SESSION_COOKIE_NAME } from '@simmer-mosquito/auth';
import type { Hono } from 'hono';
import { deleteCookie } from 'hono/cookie';
import type { AuthVariables } from '../middleware/auth-variables.js';
import { readSealedSession } from '../session-transport/read-sealed-session.js';
import { readAllowedReturnTo } from './read-allowed-return-to.js';
import type { SessionRouteOptions } from './session-route-options.js';

/**
 * GET so the app can log out by top-level navigation, POST for programmatic
 * callers. Clearing the cookie is the SIMMER logout; the WorkOS revoke is best
 * effort, and the redirect stays on our own domain.
 */
export function registerLogout(
	app: Hono<{ Variables: AuthVariables }>,
	options: SessionRouteOptions,
) {
	app.on(['GET', 'POST'], '/auth/logout', async (context) => {
		await options.auth.revokeSession(readSealedSession(context));
		deleteCookie(context, WORKOS_SESSION_COOKIE_NAME, { path: '/' });

		return context.redirect(
			readAllowedReturnTo(context.req.query('returnTo'), options.appOrigins) ?? options.appOrigin,
		);
	});
}
