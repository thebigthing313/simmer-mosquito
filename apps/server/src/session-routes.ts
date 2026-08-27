/**
 * The WorkOS session routes, and the health check beside them.
 *
 * These were written inline in `main.ts` and were the last routes the CORS walk
 * could not see. They are admitted today because `/auth/*` allows `GET` and
 * `POST`, which is luck rather than a check, and that is the whole shape of
 * #280. A route in a module is a route the walk reads.
 *
 * `/health` is in this module rather than one of its own because Railway's
 * healthcheck and the sign-in redirect are the two things a deploy proves
 * before anything else, and neither needs a database. It has its own
 * `CORS_SURFACES` entry: nothing cross-origin calls it today, but a prefix the
 * table has no entry for is the case `corsSurfaceFor` returns `null` for, and
 * the walk refuses that outright.
 *
 * `finalizeSession` is passed in rather than built here. `main.ts` owns it,
 * because it writes the sealed session and upserts the WorkOS identity, and
 * `auth-user-commands.ts` needs the same function for the password flows.
 */

import { type AuthenticatedSession, WORKOS_SESSION_COOKIE_NAME } from '@simmer-mosquito/auth';
import type { Context, Hono } from 'hono';
import { deleteCookie } from 'hono/cookie';
import {
	type AuthSessionProvider,
	type LocalAuthIdentityResolver,
	resolveAuthContext,
	toAuthFailureBody,
	toAuthMeBody,
} from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';
import { readSealedSession } from './auth-session-transport.js';
import type { FinalizeWorkOsSession } from './auth-user-commands.js';

/** What the redirect routes need of the WorkOS client. */
export interface SessionAuth {
	getAuthorizationUrl(): string;
	authenticateCode(input: {
		readonly code: string;
		readonly ipAddress?: string;
		readonly userAgent?: string;
	}): Promise<AuthenticatedSession>;
	revokeSession(sealedSession: string | undefined): Promise<void>;
}

export interface SessionRouteOptions {
	readonly auth: SessionAuth;
	/**
	 * The per-request session check, which dev impersonation swaps out while the
	 * redirect routes keep the real WorkOS client. See `main.ts`.
	 */
	readonly sessionProvider: AuthSessionProvider;
	readonly localIdentityResolver: LocalAuthIdentityResolver;
	readonly nodeEnv: 'development' | 'production' | 'test';
	readonly appOrigin: string;
	/** Where a `returnTo` may point. Anything else is dropped, not followed. */
	readonly appOrigins: readonly string[];
	readonly setAuthCookie: (
		context: Context<{ Variables: AuthVariables }>,
		sealedSession: string | undefined,
	) => void;
	readonly finalizeSession: FinalizeWorkOsSession;
}

export function registerSessionRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: SessionRouteOptions,
): void {
	const { auth, sessionProvider, localIdentityResolver, setAuthCookie, finalizeSession } = options;
	const readReturnTo = (value: string | undefined): string | null =>
		readAllowedReturnTo(value, options.appOrigins);

	app.get('/health', (context) =>
		context.json({
			ok: true,
			service: 'simmer-mosquito-server',
			environment: options.nodeEnv,
		}),
	);

	app.get('/auth/login', (context) => {
		const returnTo = readReturnTo(context.req.query('returnTo'));
		const authorizationUrl = new URL(auth.getAuthorizationUrl());
		if (returnTo !== null) {
			authorizationUrl.searchParams.set('state', returnTo);
		}

		return context.redirect(authorizationUrl.toString());
	});

	app.get('/auth/callback', async (context) => {
		const code = context.req.query('code');

		if (code === undefined || code.trim() === '') {
			return context.json({ error: 'missing_code' }, 400);
		}

		const ipAddress = context.req.header('x-forwarded-for');
		const userAgent = context.req.header('user-agent');
		const session = await auth.authenticateCode({
			code,
			...(ipAddress === undefined ? {} : { ipAddress }),
			...(userAgent === undefined ? {} : { userAgent }),
		});

		const { organizationRequired } = await finalizeSession(context, session);

		const redirectUrl = new URL(readReturnTo(context.req.query('state')) ?? options.appOrigin);
		if (organizationRequired) {
			redirectUrl.searchParams.set('auth', 'organization_required');
		}

		return context.redirect(redirectUrl.toString());
	});

	app.get('/auth/me', async (context) => {
		const result = await resolveAuthContext({
			sealedSession: readSealedSession(context),
			auth: sessionProvider,
			localIdentityResolver,
		});

		if (result.sealedSession !== undefined) {
			setAuthCookie(context, result.sealedSession);
		}

		if (!result.ok) {
			return context.json(toAuthFailureBody(result), result.status);
		}

		return context.json(toAuthMeBody(result.context));
	});

	// Accept GET so the app can log out via a top-level navigation, plus POST for
	// form/programmatic callers. Clears the sealed-session cookie (the actual
	// SIMMER logout), best-effort revokes the WorkOS session, then returns to the
	// app, staying on our own domain rather than bouncing through WorkOS-hosted
	// logout.
	app.on(['GET', 'POST'], '/auth/logout', async (context) => {
		await auth.revokeSession(readSealedSession(context));

		deleteCookie(context, WORKOS_SESSION_COOKIE_NAME, {
			path: '/',
		});

		return context.redirect(readReturnTo(context.req.query('returnTo')) ?? options.appOrigin);
	});
}

function readAllowedReturnTo(
	value: string | undefined,
	appOrigins: readonly string[],
): string | null {
	if (value === undefined || value.trim() === '') {
		return null;
	}

	try {
		const url = new URL(value);
		return appOrigins.includes(url.origin) ? url.toString() : null;
	} catch {
		return null;
	}
}
