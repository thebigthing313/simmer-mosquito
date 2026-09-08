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
 */

import type { Kysely, SimmerDatabase } from '@simmer-mosquito/db';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { AuthContext } from '../../../auth-context.js';
import type { AuthVariables } from '../../../auth-middleware.js';
import { registerTableCommandSurface } from '../../../table-commands/index.js';

export function commandApp(
	db: Kysely<SimmerDatabase>,
	organizationId: string,
	profileId: string,
): Hono<{ Variables: AuthVariables }> {
	const app = new Hono<{ Variables: AuthVariables }>();
	const authContextMiddleware = createMiddleware<{ Variables: AuthVariables }>(
		async (context, next) => {
			context.set('authContext', {
				organization: { id: organizationId },
				profile: { id: profileId },
				role: 'owner',
			} as AuthContext);
			await next();
		},
	);

	registerTableCommandSurface(app, {
		db,
		auth: {} as never,
		authContextMiddleware,
		operatorAuthContextMiddleware: authContextMiddleware,
	});

	return app;
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
