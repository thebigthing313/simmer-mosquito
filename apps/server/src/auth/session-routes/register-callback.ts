import type { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth-variables.js';
import { requestClientHints } from '../user-routes/request-client-hints.js';
import { readAllowedReturnTo } from './read-allowed-return-to.js';
import type { SessionRouteOptions } from './session-route-options.js';

export function registerCallback(
	app: Hono<{ Variables: AuthVariables }>,
	options: SessionRouteOptions,
) {
	app.get('/auth/callback', async (context) => {
		const code = context.req.query('code');
		if (code === undefined || code.trim() === '') {
			return context.json({ error: 'missing_code' }, 400);
		}

		const session = await options.auth.authenticateCode({ code, ...requestClientHints(context) });
		const { organizationRequired } = await options.finalizeSession(context, session);

		const redirectUrl = new URL(
			readAllowedReturnTo(context.req.query('state'), options.appOrigins) ?? options.appOrigin,
		);
		if (organizationRequired) {
			redirectUrl.searchParams.set('auth', 'organization_required');
		}

		return context.redirect(redirectUrl.toString());
	});
}
