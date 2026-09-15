/**
 * The `/commands/{table}` surface over a test database, as an app.
 *
 * Every write these suites make used to go through a per-domain `register*`
 * function of its own, and each suite stood one up. Those routes had no client
 * and are gone (#634), so the door is the same for all of them now and there is
 * one helper rather than seven.
 *
 * The session is an Owner, because these suites are about what the writers do
 * rather than about who may ask. `role-floors.test.ts` and
 * `command-permissions.test.ts` are where the ladder is asserted.
 *
 * `ownerSession` is exported on its own because two suites register a surface
 * that is not the command surface, the delete-impact read and the organization
 * seed, and each used to write the same stub over `createMiddleware` beside its
 * app (#924). `operatorCommandApp` is the other door: a global catalog write
 * carries a SIMMER user id and no organization, and `commandApp` stands the
 * organization session in for that door, which is enough only while no suite
 * walks through it.
 */

import type { Kysely, SimmerDatabase } from '@simmer-mosquito/db';
import { Hono, type MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { AuthContext } from '../../../auth-context.js';
import type { AuthVariables, OperatorAuthContext } from '../../../auth-middleware.js';
import { registerTableCommandSurface } from '../../../table-commands/index.js';

type SessionMiddleware = MiddlewareHandler<{ Variables: AuthVariables }>;

/** An Owner of `organizationId`, writing as `profileId`. */
export function ownerSession(organizationId: string, profileId: string): SessionMiddleware {
	return createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
		context.set('authContext', {
			organization: { id: organizationId },
			profile: { id: profileId },
			role: 'owner',
		} as AuthContext);
		await next();
	});
}

/** The operator door, which carries a SIMMER user id and no organization at all. */
function operatorSession(userId: string): SessionMiddleware {
	return createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
		context.set('operatorContext', {
			localIdentity: { user: { id: userId } },
		} as OperatorAuthContext);
		await next();
	});
}

function surfaceApp(
	db: Kysely<SimmerDatabase>,
	authContextMiddleware: SessionMiddleware,
	operatorAuthContextMiddleware: SessionMiddleware,
): Hono<{ Variables: AuthVariables }> {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerTableCommandSurface(app, {
		db,
		auth: {} as never,
		authContextMiddleware,
		operatorAuthContextMiddleware,
	});
	return app;
}

export function commandApp(
	db: Kysely<SimmerDatabase>,
	organizationId: string,
	profileId: string,
): Hono<{ Variables: AuthVariables }> {
	const session = ownerSession(organizationId, profileId);
	return surfaceApp(db, session, session);
}

/**
 * The same surface entered as an operator, for the global catalogs.
 *
 * The organization door is a session with no organization behind it, so a
 * suite that reaches an organization route through this app gets the refusal
 * the writer gives an id that matches no row, rather than a write it did not
 * mean to make.
 */
export function operatorCommandApp(
	db: Kysely<SimmerDatabase>,
	operatorUserId: string,
): Hono<{ Variables: AuthVariables }> {
	return surfaceApp(db, ownerSession('', ''), operatorSession(operatorUserId));
}

/** A command request: the verb, the commands the body means, and the columns. */
export function command(
	method: 'POST' | 'PATCH' | 'DELETE',
	intents: readonly string[],
	body: Record<string, unknown> = {},
): RequestInit {
	return {
		method,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ intents, ...body }),
	};
}
