import { createMiddleware } from 'hono/factory';
import type { AuthSessionProvider } from '../context/auth-session-provider.js';
import type { LocalAuthIdentityResolver } from '../context/local-auth-identity-resolver.js';
import { resolveAuthContext } from '../context/resolve-auth-context.js';
import { toAuthFailureBody } from '../context/to-auth-failure-body.js';
import { readSealedSession } from '../session-transport/read-sealed-session.js';
import type { AuthVariables } from './auth-variables.js';
import type { SetAuthCookie } from './set-auth-cookie.js';

/**
 * Admit an organization identity and set `authContext`. Verify only: routes
 * behind this run concurrently and a refresh token spent twice kills the
 * session (#298), so a stale access token is answered
 * `session_refresh_required` and the client renews at `/auth/me`.
 */
export function createAuthContextMiddleware(options: {
	readonly auth: AuthSessionProvider;
	readonly localIdentityResolver: LocalAuthIdentityResolver;
	/** Resolves `AuthContext.isOperator` here rather than in every route. */
	readonly operatorOrganizationId?: string | null;
	readonly setAuthCookie: SetAuthCookie;
}) {
	return createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
		const result = await resolveAuthContext({
			sealedSession: readSealedSession(context),
			auth: options.auth,
			localIdentityResolver: options.localIdentityResolver,
			operatorOrganizationId: options.operatorOrganizationId ?? null,
			mayRefresh: false,
		});

		if (result.sealedSession !== undefined) {
			options.setAuthCookie(context, result.sealedSession);
		}

		if (!result.ok) {
			return context.json(toAuthFailureBody(result), result.status);
		}

		context.set('authContext', result.context);
		await next();
	});
}
