import type { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth-variables.js';
import { readAllowedReturnTo } from './read-allowed-return-to.js';
import type { SessionRouteOptions } from './session-route-options.js';

export function registerLogin(
	app: Hono<{ Variables: AuthVariables }>,
	options: SessionRouteOptions,
) {
	app.get('/auth/login', (context) => {
		const returnTo = readAllowedReturnTo(context.req.query('returnTo'), options.appOrigins);
		const authorizationUrl = new URL(options.auth.getAuthorizationUrl());
		if (returnTo !== null) {
			authorizationUrl.searchParams.set('state', returnTo);
		}

		return context.redirect(authorizationUrl.toString());
	});
}
