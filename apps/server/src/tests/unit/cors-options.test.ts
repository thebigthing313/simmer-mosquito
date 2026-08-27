import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { describe, expect, it } from 'vitest';
import { ADMIN_CORS_ALLOW_METHODS, CORS_SURFACES, corsSurfaceFor } from '../../cors-options.js';
import {
	droppedAllEntryCount,
	prefixesWithNoRoutes,
	registeredRoutes,
} from './support/registered-routes.js';

/**
 * The check #118 asked for: every route the server registers is admitted by
 * the CORS surface its prefix falls under.
 *
 * `main.ts` mounts CORS by path prefix and each route module chooses its own
 * paths. `tsc` cannot see a string prefix and `fallow dead-code` cannot see an
 * HTTP route, so the two drifted twice before this test existed: `/map/*`
 * admitted `GET` only while `map-tiles.ts` registered
 * `POST /map/habitats/by-ids` (since deleted — it had no callers), and
 * `/larval-surveillance/*` admitted only writes while `sample-reads.ts`
 * registered a `GET` under it. The failure mode is narrow enough to survive
 * every other gate: browser only, cross-origin only, and only where the SPA and
 * API are different origins, which local Caddy makes them not.
 *
 * This builds the same app `main.ts` does — the real `register*Routes`, not a
 * list of paths to keep in step — and walks what Hono ended up with.
 */
describe('every registered route is admitted by a CORS surface', () => {
	const routes = registeredRoutes().map((route): [string, string] => [route.method, route.path]);

	it('registers a recognisable number of routes, so an empty walk cannot pass', () => {
		// Guards the assertion below: if the app failed to build, `routes` would
		// be empty and `it.each` over nothing is a green suite that proved
		// nothing.
		expect(routes.length).toBeGreaterThan(150);
	});

	it.each(routes)('%s %s', (method, path) => {
		const surface = corsSurfaceFor(path);

		expect(surface, `no CORS prefix covers ${path}`).not.toBeNull();
		expect(surface?.methods, `${method} ${path} is not admitted by ${surface?.prefix}`).toContain(
			method,
		);
	});

	// Named directly as well as caught by the walk. This is the mismatch the
	// walk found on its first run: a `GET` sitting under a prefix that admitted
	// only writes. It works today only because a credentialed `fetch` with no
	// custom header is a simple request and never preflights, which is not a
	// property anyone chose.
	it('admits the awaiting-samples read under the larval write prefix', () => {
		expect(corsSurfaceFor('/larval-surveillance/samples/awaiting')?.methods).toContain('GET');
	});

	// `/organization-settings/*` sits underneath `/organization/*`. Under a
	// first-match rule it would inherit the wrong method list and its PATCH
	// would be refused cross-origin.
	it('resolves the longer prefix when two could claim a path', () => {
		expect(corsSurfaceFor('/organization-settings/anything')?.prefix).toBe(
			'/organization-settings/*',
		);
		expect(corsSurfaceFor('/organization/current')?.prefix).toBe('/organization/*');
	});

	// Driven, not compared by name. A prefix that resolves under `corsSurfaceFor`
	// is not the same as one Hono will match: `*` is a wildcard only as a whole
	// path segment or a trailing `/*`, and `'/search*'` mounted middleware that
	// never ran once. `registered-routes.ts` has the rest of it.
	it('claims no prefix it has no route under', async () => {
		expect(await prefixesWithNoRoutes(CORS_SURFACES.map((surface) => surface.prefix))).toEqual([]);
	});

	// The walk reads `app.routes`, where Hono writes `app.use(path, mw)` and
	// `app.all(path, handler)` the same way, so it drops every `ALL` entry as
	// middleware. No route module registers one, and if that changes this fails
	// rather than letting a handler out of all three prefix checks.
	it('drops no route it mistook for middleware', () => {
		expect(droppedAllEntryCount()).toBe(0);
	});

	// The check above can fail. A prefix Hono will not match and a prefix with no
	// routes under it are the two shapes it exists to catch, and `'/search*'` is
	// the real one that shipped.
	it('names a prefix that matches nothing', async () => {
		expect(await prefixesWithNoRoutes(['/map/*', '/search*', '/nowhere/*'])).toEqual([
			'/search*',
			'/nowhere/*',
		]);
	});
});

describe('CORS preflights over the real middleware', () => {
	it('allows PATCH preflights for admin write routes', async () => {
		const response = await preflight('/admin/units/be08a10c-7d27-4130-a359-9e8874d4d2b8', 'PATCH');

		expect(response.headers.get('access-control-allow-methods')).toContain('PATCH');
		expect(ADMIN_CORS_ALLOW_METHODS).toContain('PATCH');
	});

	it('allows POST preflights for Electric subset snapshot shape routes', async () => {
		const response = await preflight('/sync/shapes/route_items', 'POST', 'content-type');

		expect(response.headers.get('access-control-allow-methods')).toContain('POST');
		expect(response.headers.get('access-control-allow-headers')).toContain('content-type');
	});

	it('allows GET preflights for the awaiting-samples read', async () => {
		const response = await preflight('/larval-surveillance/samples/awaiting', 'GET', 'accept');

		expect(response.headers.get('access-control-allow-methods')).toContain('GET');
	});
});

const TEST_ORIGIN = 'https://app.simmer-data.com';

/** The same table `main.ts` applies, over a bare app. */
function appWithCors(): Hono {
	const app = new Hono();
	for (const surface of CORS_SURFACES) {
		app.use(
			surface.prefix,
			cors({ origin: [TEST_ORIGIN], credentials: true, allowMethods: [...surface.methods] }),
		);
	}
	return app;
}

async function preflight(path: string, method: string, headers?: string): Promise<Response> {
	const app = appWithCors();
	app.all(path, (context) => context.json({ ok: true }));

	return app.request(path, {
		method: 'OPTIONS',
		headers: {
			'access-control-request-method': method,
			origin: TEST_ORIGIN,
			...(headers === undefined ? {} : { 'access-control-request-headers': headers }),
		},
	});
}
