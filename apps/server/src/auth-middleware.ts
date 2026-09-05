import type { AuthUser } from '@simmer-mosquito/auth';
import type { ActiveLocalAuthIdentity } from '@simmer-mosquito/db';
import type { Context, MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import {
	type AuthContext,
	type AuthSessionProvider,
	type LocalAuthIdentityResolver,
	resolveAuthContext,
	toAuthFailureBody,
} from './auth-context.js';
import { readSealedSession } from './auth-session-transport.js';

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
			sealedSession: readSealedSession(context),
			auth: options.auth,
			localIdentityResolver: options.localIdentityResolver,
			operatorOrganizationId: options.operatorOrganizationId ?? null,

			// Verify only. Every route behind this middleware runs concurrently with
			// the others — the shape streams go out several at a time — and a refresh
			// token spent twice kills the session (#298). A stale access token is
			// answered 401 with `session_refresh_required`, which the client trades
			// for a fresh one at `/auth/me` before retrying.
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

/**
 * Admit an agency identity **or** an operator one, for a shape that is neither's.
 *
 * The global catalogs — `genera`, `species`, `units` — have no `organization_id`
 * and every agency reads them, so their shape route forces no tenant predicate at
 * all: `shapeScopeFilter` returns `{}` for `global` and never touches
 * `authContext`. The only thing left to check is that somebody is signed in.
 *
 * That is why `apps/admin` needed a second set of routes under `/admin` in the
 * first place — an operator session has no agency context, so it could not pass
 * the agency middleware — and it is why the second set can now go: one route can
 * ask for either identity when it uses neither.
 *
 * **Only safe on a `global` scope, and `registerSyncShapeRoutes` asserts it.**
 * On an operator session this sets `operatorContext` and leaves `authContext`
 * unset, so a handler that reads the agency organization would find nothing
 * there. A scoped shape reached through this would not fail — it would stream
 * without a predicate.
 *
 * The agency door is tried first and its refusal is the one returned. Both
 * answer 401 to a caller with no session, and for these three tables almost
 * every caller is an agency user, so "you have no membership" is the more useful
 * of the two things to be told.
 */
export function createGlobalReadMiddleware(options: {
	readonly organization: MiddlewareHandler<{ Variables: AuthVariables }>;
	readonly operator: MiddlewareHandler<{ Variables: AuthVariables }>;
}) {
	return createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
		let admitted = false;
		const markAdmitted = async () => {
			admitted = true;
		};

		const organizationRefusal = await options.organization(context, markAdmitted);
		if (admitted) {
			return next();
		}

		await options.operator(context, markAdmitted);
		if (admitted) {
			return next();
		}

		return organizationRefusal;
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
		const session = await options.auth.authenticateSession(readSealedSession(context), {
			// Verify only, for the same reason as the agency middleware above.
			mayRefresh: false,
		});

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

		/*
		 * Two refusals, not one, because they have different fixes and only the
		 * server can tell them apart.
		 *
		 * `operator_required` means the session is real and is not SIMMER's. The
		 * console answers it by offering a sign-out, because signing back in as
		 * SIMMER is what helps.
		 *
		 * `operator_not_configured` means `SIMMER_OPERATOR_ORG_ID` is unset, so
		 * there is no organization to compare against and nobody can be an
		 * operator here. Signing in again cannot fix that, and the console used to
		 * tell the operator to try, because both branches answered
		 * `operator_required` and the console had no way to know which one it hit.
		 * The status stays 403 either way: the unset case still refuses everyone,
		 * which is the safe reading (see `AuthContext.isOperator`).
		 *
		 * A session with no organization at all lands in the first branch only when
		 * the variable is set; unset refuses first, so `null === null` is never
		 * reached.
		 */
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
