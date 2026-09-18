import type { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth-variables.js';
import type { SessionRouteOptions } from './session-route-options.js';

/** Railway's healthcheck. Needs no database, so it sits beside the sign-in redirect a deploy proves first. */
export function registerHealth(
	app: Hono<{ Variables: AuthVariables }>,
	options: SessionRouteOptions,
) {
	app.get('/health', (context) =>
		context.json({ ok: true, service: 'simmer-mosquito-server', environment: options.nodeEnv }),
	);
}
