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

export function createOperatorAuthContextMiddleware(options: {
	readonly auth: AuthSessionProvider;
	readonly localIdentityResolver: LocalAuthIdentityResolver;
	readonly isOperatorEmail: (email: string) => boolean;
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

		if (!options.isOperatorEmail(session.user.email)) {
			return context.json({ error: 'operator_required' }, 403);
		}

		const localIdentity =
			session.workosOrganizationId === null
				? null
				: await options.localIdentityResolver.resolveActiveLocalAuthIdentity({
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
