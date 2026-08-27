/**
 * The routes the server actually registers, for the three path-prefix tables
 * that are mounted against them.
 *
 * `main.ts` mounts three lists of path prefixes as middleware
 * (`CORS_SURFACES`, `PRIVATE_READ_PREFIXES`, `COMPRESSED_READ_PREFIXES`) and
 * every route module chooses its own paths. Nothing in the type system connects
 * a string prefix to a route, so the only check available is to build the app
 * and look.
 *
 * `registerAllRoutes` is what makes that honest. It is the same function the
 * server calls, so a module none of these tests has heard of is still walked.
 * See `routes.ts` and #280 for what the hand-mirrored version missed.
 */

import { createCompileOnlyDb } from '@simmer-mosquito/db/test-support';
import type { MiddlewareHandler } from 'hono';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { AuthVariables } from '../../../auth-middleware.js';
import { registerAllRoutes, type ServerDeps } from '../../../routes.js';

export interface RegisteredRoute {
	readonly method: string;
	readonly path: string;
}

let walked: readonly RegisteredRoute[] | null = null;
let allEntryCount = 0;

const TEST_ORIGIN = 'https://app.simmer-data.com';

/**
 * Build the app the way `main.ts` does and read back what Hono registered.
 *
 * Everything injected is inert. The point is which paths and verbs exist, not
 * what they do.
 *
 * Built once. Four tests ask for the list, the graph is 450-odd routes, and
 * nothing here mutates it.
 */
export function registeredRoutes(): readonly RegisteredRoute[] {
	if (walked !== null) {
		return walked;
	}

	const app = new Hono<{ Variables: AuthVariables }>();
	const inert = createMiddleware<{ Variables: AuthVariables }>((_context, next) => next());

	registerAllRoutes(app, {
		db: createCompileOnlyDb(),
		auth: {} as ServerDeps['auth'],
		mailer: {} as ServerDeps['mailer'],
		sessionProvider: {} as ServerDeps['sessionProvider'],
		localIdentityResolver: {} as ServerDeps['localIdentityResolver'],
		nodeEnv: 'test',
		appOrigin: TEST_ORIGIN,
		appOrigins: [TEST_ORIGIN],
		setAuthCookie: () => {},
		finalizeSession: async () => ({ organizationRequired: false }),
		geocoderApiKey: null,
		electricUrl: null,
		authContextMiddleware: inert,
		operatorAuthContextMiddleware: inert,
	});

	// `ALL` entries are middleware registrations, not routes with a verb. No
	// route module registers any today, and `cors-options.test.ts` asserts that,
	// because Hono writes `app.use(path, mw)` and `app.all(path, handler)` into
	// `app.routes` identically. Dropping them silently would put an `app.all`
	// handler outside all three checks, which is the omission #280 is about.
	allEntryCount = app.routes.filter((route) => route.method === 'ALL').length;
	walked = app.routes
		.filter((route) => route.method !== 'ALL')
		.map((route) => ({ method: route.method, path: route.path }));

	return walked;
}

/**
 * How many `ALL` entries the walk dropped. See the comment where it counts them:
 * this is a category the walk cannot check, so it has to be empty.
 */
export function droppedAllEntryCount(): number {
	registeredRoutes();
	return allEntryCount;
}

/** A path a request can be made to: every `:param` filled with a placeholder. */
function concretePath(path: string): string {
	return path.replace(/:[^/]+/g, 'x');
}

/**
 * Which of `prefixes` no registered route falls under.
 *
 * Driven rather than compared by name, because the trap here is a prefix that
 * looks right and matches nothing. Hono treats `*` as a wildcard only where it
 * is a whole path segment or a trailing `/*`, and escapes it to a literal
 * anywhere else, so `'/search*'` mounted middleware that never ran once. In the
 * source, a middleware that never runs and a middleware that matches everything
 * read the same. This mounts the real paths under the real prefix list and
 * records which prefixes a request actually reached.
 */
export async function prefixesWithNoRoutes(prefixes: readonly string[]): Promise<string[]> {
	const routes = registeredRoutes();
	const app = new Hono();
	const reached = new Set<string>();

	for (const prefix of prefixes) {
		app.use(prefix, recordReached(prefix, reached));
	}
	for (const route of routes) {
		app.on(route.method, route.path, (context) => context.json({ ok: true }));
	}

	for (const route of routes) {
		await app.request(concretePath(route.path), { method: route.method });
	}

	return prefixes.filter((prefix) => !reached.has(prefix));
}

function recordReached(prefix: string, reached: Set<string>): MiddlewareHandler {
	return async (_context, next) => {
		reached.add(prefix);
		await next();
	};
}
