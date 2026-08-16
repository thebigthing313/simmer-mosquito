import type { AuthUser } from '@simmer-mosquito/auth';
import { WORKOS_SESSION_COOKIE_NAME } from '@simmer-mosquito/auth';
import type { ActiveLocalAuthIdentity } from '@simmer-mosquito/db';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import {
	type AuthContext,
	type AuthSessionProvider,
	type LocalAuthIdentityResolver,
	resolveAuthContext,
	toAuthFailureBody,
} from './auth-context.js';

export interface AuthVariables {
	readonly authContext: AuthContext;
	readonly operatorContext: OperatorAuthContext;
}

export interface OperatorAuthContext {
	readonly workosUser: AuthUser;
	readonly workosOrganizationId: string | null;
	readonly workosSessionId: string | null;
	readonly workosRole: string | null;
	readonly localIdentity: ActiveLocalAuthIdentity | null;
}

export function createAuthContextMiddleware(options: {
	readonly auth: AuthSessionProvider;
	readonly localIdentityResolver: LocalAuthIdentityResolver;
	/**
	 * Passed through so `AuthContext.isOperator` can be resolved here rather than
	 * re-derived by every route that serves operators and agencies alike.
	 */
	readonly operatorOrganizationId?: string | null;
	readonly setAuthCookie: (
		context: Context<{ Variables: AuthVariables }>,
		sealedSession: string | undefined,
	) => void;
}) {
	return createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
		const result = await resolveAuthContext({
			sealedSession: getCookie(context, WORKOS_SESSION_COOKIE_NAME),
			auth: options.auth,
			localIdentityResolver: options.localIdentityResolver,
			operatorOrganizationId: options.operatorOrganizationId ?? null,
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

/**
 * A SIMMER operator is someone signed in **as SIMMER**.
 *
 * There is one WorkOS organization that is SIMMER, in any environment, so the
 * test is an equality: the session's organization is that one, or the caller is
 * not an operator here.
 *
 * It used to be an allowlist of email addresses in `SIMMER_OPERATOR_EMAILS`, and
 * the difference is not only that a list of addresses drifts from who actually
 * works here. An email is a property of the *person*, so it stayed true after
 * they changed sessions: an operator who had switched into an agency (ADR 0011
 * — operators join agencies as admins) still passed, and could reach the
 * operator console while holding an agency session. The two session kinds are
 * meant to be mutually exclusive, and now one fact enforces that rather than two
 * facts agreeing.
 *
 * `null` — the variable unset — refuses everyone. An unconfigured server has no
 * operators rather than no check.
 */
export function createOperatorAuthContextMiddleware(options: {
	readonly auth: AuthSessionProvider;
	readonly localIdentityResolver: LocalAuthIdentityResolver;
	readonly operatorOrganizationId: string | null;
	readonly setAuthCookie: (
		context: Context<{ Variables: AuthVariables }>,
		sealedSession: string | undefined,
	) => void;
}) {
	return createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
		const session = await options.auth.authenticateSession(
			getCookie(context, WORKOS_SESSION_COOKIE_NAME),
		);

		if (!session.authenticated) {
			return context.json(
				{
					authenticated: false,
					error: 'unauthenticated',
					reason: session.reason,
				},
				401,
			);
		}

		if (session.sealedSession !== undefined) {
			options.setAuthCookie(context, session.sealedSession);
		}

		// A session with no organization at all fails this too: `null === null` is
		// never reached, because an unset `operatorOrganizationId` refuses first.
		if (
			options.operatorOrganizationId === null ||
			session.workosOrganizationId !== options.operatorOrganizationId
		) {
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
