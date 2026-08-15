import { createCompileOnlyDb } from '@simmer-mosquito/db/test-support';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it } from 'vitest';
import { registerAdminFoundationRoutes } from '../../admin-foundations.js';
import { registerAdminInvitationRoutes } from '../../admin-invitations.js';
import { registerAdultSurveillanceCommandRoutes } from '../../adult-surveillance-commands/index.js';
import type { AuthVariables } from '../../auth-middleware.js';
import { registerAuthUserRoutes } from '../../auth-user-commands.js';
import { registerControlAssetCommandRoutes } from '../../control-asset-commands.js';
import { registerControlMethodCommandRoutes } from '../../control-method-commands.js';
import { registerControlOperationsCommandRoutes } from '../../control-operations-commands/index.js';
import { registerControlProductCommandRoutes } from '../../control-product-commands.js';
import { ADMIN_CORS_ALLOW_METHODS, CORS_SURFACES, corsSurfaceFor } from '../../cors-options.js';
import { registerFieldWorkCommandRoutes } from '../../field-work-commands/index.js';
import { registerFoundationCommandRoutes } from '../../foundation-commands/index.js';
import { registerFoundationGeographyCommandRoutes } from '../../foundation-geography-commands/index.js';
import { registerGeocoderRoutes } from '../../geocoder.js';
import { registerLarvalSurveillanceCommandRoutes } from '../../larval-surveillance-commands/index.js';
import { registerMapTileRoutes } from '../../map-tiles.js';
import { registerMissionDispatchCommandRoutes } from '../../mission-dispatch-commands/index.js';
import { registerOrganizationCommandRoutes } from '../../organization-commands.js';
import { registerOrganizationSettingsCommandRoutes } from '../../organization-settings-commands.js';
import { registerProfileCommandRoutes } from '../../profile-commands.js';
import { registerPublicEngagementCommandRoutes } from '../../public-engagement-commands.js';
import { registerPublicEngagementRecordRoutes } from '../../public-engagement-records-commands/index.js';
import { registerRecordDeletionRoutes } from '../../record-deletion.js';
import { registerServiceRequestNearbyRoutes } from '../../service-request-nearby.js';
import { registerSyncShapeRoutes } from '../../sync-shapes.js';

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
	const routes = registeredRoutes();

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

	it('claims no path it has no route for, and no route it has no path for', () => {
		const claimed = new Set(routes.map((route) => corsSurfaceFor(route[1])?.prefix));

		for (const surface of CORS_SURFACES) {
			expect(claimed, `${surface.prefix} has no routes under it`).toContain(surface.prefix);
		}
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

/**
 * Build the app the way `main.ts` does and read back what Hono registered.
 *
 * Everything injected here is inert — the point is which paths and verbs exist,
 * not what they do — but they are the real registration functions, so a route
 * added anywhere shows up without this file being edited.
 */
function registeredRoutes(): [string, string][] {
	const app = new Hono<{ Variables: AuthVariables }>();
	const db = createCompileOnlyDb();
	const authContextMiddleware = createMiddleware<{ Variables: AuthVariables }>((_c, next) =>
		next(),
	);
	const options = { db, authContextMiddleware } as never;

	registerSyncShapeRoutes(app, {
		electricUrl: null,
		authContextMiddleware,
		operatorAuthContextMiddleware: authContextMiddleware,
	});
	registerMapTileRoutes(app, options);
	registerServiceRequestNearbyRoutes(app, { db, authContextMiddleware });
	registerRecordDeletionRoutes(app, { db, authContextMiddleware });
	registerGeocoderRoutes(app, { apiKey: null, authContextMiddleware });
	registerAdminFoundationRoutes(app, {
		db,
		operatorAuthContextMiddleware: authContextMiddleware as never,
	});
	registerAdminInvitationRoutes(app, {
		db,
		auth: {} as never,
		operatorAuthContextMiddleware: authContextMiddleware as never,
	});
	registerAuthUserRoutes(app, {
		auth: {} as never,
		mailer: {} as never,
		appOrigin: TEST_ORIGIN,
		finalizeSession: (async () => ({ organizationRequired: false })) as never,
	});
	registerProfileCommandRoutes(app, { db, auth: {} as never, authContextMiddleware });
	registerOrganizationCommandRoutes(app, { db, authContextMiddleware });
	registerOrganizationSettingsCommandRoutes(app, { db, authContextMiddleware });
	registerFoundationCommandRoutes(app, options);
	registerFoundationGeographyCommandRoutes(app, options);
	registerLarvalSurveillanceCommandRoutes(app, options);
	registerAdultSurveillanceCommandRoutes(app, options);
	registerControlOperationsCommandRoutes(app, options);
	registerControlAssetCommandRoutes(app, options);
	registerControlMethodCommandRoutes(app, options);
	registerControlProductCommandRoutes(app, options);
	registerPublicEngagementCommandRoutes(app, options);
	registerPublicEngagementRecordRoutes(app, options);
	registerFieldWorkCommandRoutes(app, options);
	registerMissionDispatchCommandRoutes(app, options);

	// `ALL` entries are middleware registrations, not routes with a verb.
	return app.routes
		.filter((route) => route.method !== 'ALL')
		.map((route): [string, string] => [route.method, route.path]);
}
