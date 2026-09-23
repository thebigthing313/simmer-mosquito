import type { Hono } from 'hono';
import { resolveAuthContext } from '../context/resolve-auth-context.js';
import { toAuthFailureBody } from '../context/to-auth-failure-body.js';
import { toAuthMeBody } from '../context/to-auth-me-body.js';
import type { AuthVariables } from '../middleware/auth-variables.js';
import { readSealedSession } from '../session-transport/read-sealed-session.js';
import type { SessionRouteOptions } from './session-route-options.js';

/** What `authenticateSession` answers a caller that presented no session at all. */
const NO_SESSION_REASON = 'no_session_cookie_provided';

/**
 * The one caller that may rotate the sealed session (#298): the browser asks
 * here one request at a time and always reads the answer. A refusal here is a
 * decision rather than the routine 401, so it is logged, except for a caller
 * with no cookie at all, which every first visit and crawler produces.
 */
export function registerMe(app: Hono<{ Variables: AuthVariables }>, options: SessionRouteOptions) {
	app.get('/auth/me', async (context) => {
		const result = await resolveAuthContext({
			sealedSession: readSealedSession(context),
			auth: options.sessionProvider,
			localIdentityResolver: options.localIdentityResolver,
			mayRefresh: true,
		});

		if (result.sealedSession !== undefined) {
			options.setAuthCookie(context, result.sealedSession);
		}

		if (!result.ok) {
			const body = toAuthFailureBody(result);
			if (body.detail !== NO_SESSION_REASON) {
				console.warn(`[auth] /auth/me refused: ${body.error} (${body.detail ?? body.reason})`);
			}

			return context.json(body, result.status);
		}

		return context.json(toAuthMeBody(result.context));
	});
}
