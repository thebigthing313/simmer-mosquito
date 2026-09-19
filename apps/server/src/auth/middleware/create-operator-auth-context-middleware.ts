import { createMiddleware } from 'hono/factory';
import type { AuthSessionProvider } from '../context/auth-session-provider.js';
import type { LocalAuthIdentityResolver } from '../context/local-auth-identity-resolver.js';
import { toAuthFailureBody } from '../context/to-auth-failure-body.js';
import { unauthenticatedRefusal } from '../context/unauthenticated-refusal.js';
import { readSealedSession } from '../session-transport/read-sealed-session.js';
import type { AuthVariables } from './auth-variables.js';
import type { SetAuthCookie } from './set-auth-cookie.js';

/**
 * Admit someone signed in as SIMMER: the session's WorkOS organization is the
 * one operator organization. An equality rather than an email allowlist,
 * because an email stays true after an operator switches into an organization
 * (ADR 0011) and the two session kinds are meant to be mutually exclusive.
 *
 * Two 403s, since they have different fixes: `operator_required` is a real
 * session that is not SIMMER's, answered by signing out; and
 * `operator_not_configured` is `SIMMER_OPERATOR_ORG_ID` unset, which refuses
 * everyone and which signing in again cannot fix.
 */
export function createOperatorAuthContextMiddleware(options: {
	readonly auth: AuthSessionProvider;
	readonly localIdentityResolver: LocalAuthIdentityResolver;
	readonly operatorOrganizationId: string | null;
	readonly setAuthCookie: SetAuthCookie;
}) {
	return createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
		const session = await options.auth.authenticateSession(readSealedSession(context), {
			mayRefresh: false,
		});

		if (!session.authenticated) {
			const refusal = unauthenticatedRefusal(session.reason);
			return context.json(toAuthFailureBody(refusal), refusal.status);
		}

		if (session.sealedSession !== undefined) {
			options.setAuthCookie(context, session.sealedSession);
		}

		if (options.operatorOrganizationId === null) {
			return context.json({ error: 'operator_not_configured' }, 403);
		}

		if (session.workosOrganizationId !== options.operatorOrganizationId) {
			return context.json({ error: 'operator_required' }, 403);
		}

		const localIdentity = await options.localIdentityResolver.resolveActiveLocalAuthIdentity({
			workosUserId: session.user.workosUserId,
			workosOrganizationId: session.workosOrganizationId,
		});

		context.set('operatorContext', {
			workosUser: session.user,
			workosOrganizationId: session.workosOrganizationId,
			workosSessionId: session.sessionId,
			workosRole: session.role,
			localIdentity,
		});
		await next();
	});
}
