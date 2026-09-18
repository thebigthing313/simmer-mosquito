import type { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth-variables.js';
import { registerCallback } from './register-callback.js';
import { registerHealth } from './register-health.js';
import { registerLogin } from './register-login.js';
import { registerLogout } from './register-logout.js';
import { registerMe } from './register-me.js';
import type { SessionRouteOptions } from './session-route-options.js';

/**
 * The WorkOS session routes and the health check beside them. In a module
 * rather than `main.ts` so the CORS walk reads them (#280); `finalizeSession`
 * is passed in because `main.ts` owns the cookie write and identity upsert.
 */
export function registerSessionRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: SessionRouteOptions,
): void {
	registerHealth(app, options);
	registerLogin(app, options);
	registerCallback(app, options);
	registerMe(app, options);
	registerLogout(app, options);
}
