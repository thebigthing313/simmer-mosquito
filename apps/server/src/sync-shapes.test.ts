import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it } from 'vitest';
import type { AuthVariables } from './auth-middleware.js';
import {
	buildElectricShapeRequest,
	buildElectricShapeUrl,
	registerSyncShapeRoutes,
} from './sync-shapes.js';

describe('buildElectricShapeUrl', () => {
	it('forces server-owned shape params while preserving Electric stream params', () => {
		const url = new URL(
			buildElectricShapeUrl({
				electricUrl: 'http://localhost:3001/v1/shape?replica=full',
				incomingUrl:
					'http://localhost:3000/sync/shapes/units?table=profiles&columns=email&where=true&offset=123&handle=abc&live=true',
				columns: ['id', 'code'],
				table: 'units',
			}),
		);

		expect(url.origin).toBe('http://localhost:3001');
		expect(url.pathname).toBe('/v1/shape');
		expect(url.searchParams.get('replica')).toBe('full');
		expect(url.searchParams.get('offset')).toBe('123');
		expect(url.searchParams.get('handle')).toBe('abc');
		expect(url.searchParams.get('live')).toBe('true');
		expect(url.searchParams.get('table')).toBe('units');
		expect(url.searchParams.get('columns')).toBe('id,code');
		expect(url.searchParams.get('where')).toBeNull();
	});

	it('adds a server-owned where clause for scoped shapes', () => {
		const url = new URL(
			buildElectricShapeUrl({
				electricUrl: 'http://localhost:3001/v1/shape',
				incomingUrl: 'http://localhost:3000/sync/shapes/profiles',
				columns: ['id', 'organization_id', 'display_name'],
				table: 'profiles',
				where: "organization_id = 'org-1' and deleted_at is null",
			}),
		);

		expect(url.searchParams.get('table')).toBe('profiles');
		expect(url.searchParams.get('columns')).toBe('id,organization_id,display_name');
		expect(url.searchParams.get('where')).toBe("organization_id = 'org-1' and deleted_at is null");
	});

	it('supports numbered organization address columns', () => {
		const url = new URL(
			buildElectricShapeUrl({
				electricUrl: 'http://localhost:3001/v1/shape',
				incomingUrl: 'http://localhost:3000/sync/shapes/organization',
				columns: ['id', 'mailing_address_line_1', 'mailing_address_line_2'],
				table: 'organizations',
			}),
		);

		expect(url.searchParams.get('columns')).toBe(
			'id,mailing_address_line_1,mailing_address_line_2',
		);
	});

	it('supports selected organization shapes without soft-delete columns', () => {
		const url = new URL(
			buildElectricShapeUrl({
				electricUrl: 'http://localhost:3001/v1/shape',
				incomingUrl: 'http://localhost:3000/sync/shapes/memberships',
				columns: ['id', 'organization_id', 'profile_id', 'role'],
				table: 'memberships',
				where: 'organization_id = $1',
				params: ['org-1'],
			}),
		);

		expect(url.searchParams.get('table')).toBe('memberships');
		expect(url.searchParams.get('columns')).toBe('id,organization_id,profile_id,role');
		expect(url.searchParams.get('where')).toBe('organization_id = $1');
		expect(url.searchParams.get('params[1]')).toBe('org-1');
	});

	it('uses POST body params for Electric subset snapshots', () => {
		const request = buildElectricShapeRequest({
			electricUrl: 'http://localhost:3001/v1/shape',
			incomingUrl:
				'http://localhost:3000/sync/shapes/routes?offset=123&handle=shape-1&subset__where=route_type%20%3D%20%241&subset__params=%7B%221%22%3A%22trap%22%7D&subset__limit=25&subset__offset=50&subset__order_by=created_at%20DESC',
			columns: ['id', 'organization_id', 'route_name', 'route_type'],
			table: 'routes',
			where: 'organization_id = $1 and deleted_at is null',
			params: ['org-1'],
		});
		const url = new URL(request.url);

		expect(request.init.method).toBe('POST');
		expect(request.init.body).toBe(
			JSON.stringify({
				where: 'route_type = $1',
				params: { '1': 'trap' },
				limit: 25,
				offset: 50,
				order_by: 'created_at DESC',
			}),
		);
		expect(url.searchParams.get('offset')).toBe('123');
		expect(url.searchParams.get('handle')).toBe('shape-1');
		expect(url.searchParams.get('table')).toBe('routes');
		expect(url.searchParams.get('columns')).toBe('id,organization_id,route_name,route_type');
		expect(url.searchParams.get('where')).toBe('organization_id = $1 and deleted_at is null');
		expect(url.searchParams.get('params[1]')).toBe('org-1');
		expect(url.searchParams.get('subset__where')).toBeNull();
	});

	it('forwards a POST subset body while forcing the org-scoped shape', () => {
		const request = buildElectricShapeRequest({
			electricUrl: 'http://localhost:3001/v1/shape',
			incomingUrl: 'http://localhost:3000/sync/shapes/route-items?offset=-1&handle=shape-1',
			columns: ['id', 'organization_id', 'route_id'],
			table: 'route_items',
			where: 'organization_id = $1 and deleted_at is null',
			params: ['org-1'],
			subsetBody: {
				where: 'route_id = $1',
				params: { '1': 'route-9' },
				limit: 50,
			},
		});
		const url = new URL(request.url);

		expect(request.init.method).toBe('POST');
		expect(request.init.body).toBe(
			JSON.stringify({ where: 'route_id = $1', params: { '1': 'route-9' }, limit: 50 }),
		);
		expect(url.searchParams.get('table')).toBe('route_items');
		expect(url.searchParams.get('columns')).toBe('id,organization_id,route_id');
		expect(url.searchParams.get('where')).toBe('organization_id = $1 and deleted_at is null');
		expect(url.searchParams.get('params[1]')).toBe('org-1');
		expect(url.searchParams.get('offset')).toBe('-1');
		expect(url.searchParams.get('handle')).toBe('shape-1');
	});

	it('strips non-subset keys from a POST subset body', () => {
		const request = buildElectricShapeRequest({
			electricUrl: 'http://localhost:3001/v1/shape',
			incomingUrl: 'http://localhost:3000/sync/shapes/habitats',
			columns: ['id', 'organization_id', 'lat', 'lng'],
			table: 'habitats',
			where: 'organization_id = $1 and deleted_at is null',
			params: ['org-1'],
			subsetBody: {
				where: 'habitat_type_id = $1',
				params: { '1': 'type-3' },
				// Caller attempts to escape tenant scope — all must be dropped.
				table: 'organizations',
				columns: 'secret',
				org_id: 'other-org',
			},
		});
		const url = new URL(request.url);

		expect(request.init.method).toBe('POST');
		expect(request.init.body).toBe(
			JSON.stringify({ where: 'habitat_type_id = $1', params: { '1': 'type-3' } }),
		);
		expect(url.searchParams.get('table')).toBe('habitats');
		expect(url.searchParams.get('columns')).toBe('id,organization_id,lat,lng');
		expect(url.searchParams.get('where')).toBe('organization_id = $1 and deleted_at is null');
	});

	it('keeps POST method for an empty subset body', () => {
		const request = buildElectricShapeRequest({
			electricUrl: 'http://localhost:3001/v1/shape',
			incomingUrl: 'http://localhost:3000/sync/shapes/habitats',
			columns: ['id', 'organization_id'],
			table: 'habitats',
			where: 'organization_id = $1 and deleted_at is null',
			params: ['org-1'],
			subsetBody: {},
		});

		expect(request.init.method).toBe('POST');
		expect(request.init.body).toBe('{}');
	});
});

describe('registerSyncShapeRoutes', () => {
	it.each([
		['/sync/shapes/insecticides'],
		['/sync/shapes/insecticide-batches'],
		['/sync/shapes/habitats'],
		['/sync/shapes/inspections'],
		['/sync/shapes/samples'],
		['/sync/shapes/sample-species'],
		['/sync/shapes/region-folders'],
		['/sync/shapes/regions'],
		['/sync/shapes/traps'],
		['/sync/shapes/collections'],
		['/sync/shapes/collection-species'],
		['/sync/shapes/comments'],
		['/sync/shapes/tag-items'],
		['/sync/shapes/additional-personnel'],
		['/sync/shapes/route-items'],
		['/sync/shapes/assignments'],
		['/sync/shapes/assignment-items'],
		['/sync/shapes/formulations'],
		['/sync/shapes/formulation-insecticides'],
		['/sync/shapes/applications'],
		['/sync/shapes/application-batches'],
		['/sync/shapes/source-reductions'],
		['/sync/shapes/outreach-actions'],
		['/sync/shapes/biocontrol-actions'],
		['/sync/shapes/contacts'],
		['/sync/shapes/service-requests'],
		['/sync/shapes/requested-control-actions'],
		['/sync/shapes/missions'],
		['/sync/shapes/mission-items'],
		['/sync/shapes/notification-registrations'],
		['/sync/shapes/notification-registration-types'],
		['/sync/shapes/mission-notifications'],
		['/sync/shapes/weather-sources'],
		['/sync/shapes/weather-source-subscriptions'],
		['/sync/shapes/weather-summaries'],
	])('registers %s', async (path) => {
		const app = new Hono<{ Variables: AuthVariables }>();

		registerSyncShapeRoutes(app, {
			electricUrl: null,
			authContextMiddleware: createMiddleware(async (_context, next) => next()),
			operatorAuthContextMiddleware: createMiddleware(async (_context, next) => next()),
		});

		const response = await app.request(path);

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: 'electric_url_required' });
	});

	it('registers org-scoped insecticide batch shapes', async () => {
		const app = new Hono<{ Variables: AuthVariables }>();
		const requests: string[] = [];

		registerSyncShapeRoutes(app, {
			electricUrl: 'http://localhost:3001/v1/shape',
			authContextMiddleware: createMiddleware(async (context, next) => {
				context.set('authContext', {
					organization: { id: 'org-1' },
				} as never);
				await next();
			}),
			operatorAuthContextMiddleware: createMiddleware(async (_context, next) => next()),
			fetch: ((request) => {
				requests.push(String(request));
				return Promise.resolve(new Response('[]'));
			}) as typeof fetch,
		});

		const response = await app.request('/sync/shapes/insecticide-batches');
		const upstream = new URL(requests[0] ?? '');

		expect(response.status).toBe(200);
		expect(upstream.searchParams.get('table')).toBe('insecticide_batches');
		expect(upstream.searchParams.get('columns')).toContain('organization_id');
		expect(upstream.searchParams.get('where')).toBe('organization_id = $1 and deleted_at is null');
		expect(upstream.searchParams.get('params[1]')).toBe('org-1');
	});

	it('registers org-scoped larval surveillance shapes', async () => {
		const app = new Hono<{ Variables: AuthVariables }>();
		const requests: string[] = [];

		registerSyncShapeRoutes(app, {
			electricUrl: 'http://localhost:3001/v1/shape',
			authContextMiddleware: createMiddleware(async (context, next) => {
				context.set('authContext', {
					organization: { id: 'org-1' },
				} as never);
				await next();
			}),
			operatorAuthContextMiddleware: createMiddleware(async (_context, next) => next()),
			fetch: ((request) => {
				requests.push(String(request));
				return Promise.resolve(new Response('[]'));
			}) as typeof fetch,
		});

		const response = await app.request('/sync/shapes/inspections');
		const upstream = new URL(requests[0] ?? '');

		expect(response.status).toBe(200);
		expect(upstream.searchParams.get('table')).toBe('inspections');
		expect(upstream.searchParams.get('columns')).toContain('habitat_id');
		expect(upstream.searchParams.get('columns')).toContain('inspection_date');
		expect(upstream.searchParams.get('where')).toBe('organization_id = $1 and deleted_at is null');
		expect(upstream.searchParams.get('params[1]')).toBe('org-1');
	});

	it('proxies a POST subset request through the org-scoped shape', async () => {
		const app = new Hono<{ Variables: AuthVariables }>();
		const calls: Array<{ url: string; init: RequestInit | undefined }> = [];

		registerSyncShapeRoutes(app, {
			electricUrl: 'http://localhost:3001/v1/shape',
			authContextMiddleware: createMiddleware(async (context, next) => {
				context.set('authContext', {
					organization: { id: 'org-1' },
				} as never);
				await next();
			}),
			operatorAuthContextMiddleware: createMiddleware(async (_context, next) => next()),
			fetch: ((url, init) => {
				calls.push({ url: String(url), init: init as RequestInit | undefined });
				return Promise.resolve(new Response('{"data":[]}'));
			}) as typeof fetch,
		});

		const response = await app.request('/sync/shapes/route-items', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				where: 'route_id = $1',
				params: { '1': 'route-9' },
				// Injection attempt — must be stripped.
				table: 'organizations',
			}),
		});
		const upstream = new URL(calls[0]?.url ?? '');

		expect(response.status).toBe(200);
		expect(calls[0]?.init?.method).toBe('POST');
		expect(calls[0]?.init?.body).toBe(
			JSON.stringify({ where: 'route_id = $1', params: { '1': 'route-9' } }),
		);
		expect(upstream.searchParams.get('table')).toBe('route_items');
		expect(upstream.searchParams.get('where')).toBe('organization_id = $1 and deleted_at is null');
		expect(upstream.searchParams.get('params[1]')).toBe('org-1');
	});

	it('returns 503 for a POST subset request without an electric url', async () => {
		const app = new Hono<{ Variables: AuthVariables }>();

		registerSyncShapeRoutes(app, {
			electricUrl: null,
			authContextMiddleware: createMiddleware(async (_context, next) => next()),
			operatorAuthContextMiddleware: createMiddleware(async (_context, next) => next()),
		});

		const response = await app.request('/sync/shapes/route-items', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}',
		});

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: 'electric_url_required' });
	});

	it('streams centroid columns but never raw geometry for the habitats shape', async () => {
		const app = new Hono<{ Variables: AuthVariables }>();
		const requests: string[] = [];

		registerSyncShapeRoutes(app, {
			electricUrl: 'http://localhost:3001/v1/shape',
			authContextMiddleware: createMiddleware(async (context, next) => {
				context.set('authContext', {
					organization: { id: 'org-1' },
				} as never);
				await next();
			}),
			operatorAuthContextMiddleware: createMiddleware(async (_context, next) => next()),
			fetch: ((request) => {
				requests.push(String(request));
				return Promise.resolve(new Response('[]'));
			}) as typeof fetch,
		});

		const response = await app.request('/sync/shapes/habitats');
		const upstream = new URL(requests[0] ?? '');
		const columns = upstream.searchParams.get('columns')?.split(',') ?? [];

		expect(response.status).toBe(200);
		// Trigger-maintained centroid columns sync so pins ride the row.
		expect(columns).toContain('lat');
		expect(columns).toContain('lng');
		expect(columns).toContain('geom_type');
		// Raw/heavy geometry stays server-only (served by /map/*).
		expect(columns).not.toContain('geom');
		expect(columns).not.toContain('geojson');
	});

	it('does not request server-only geometry columns from locatable shapes', async () => {
		const app = new Hono<{ Variables: AuthVariables }>();
		const requests: string[] = [];

		registerSyncShapeRoutes(app, {
			electricUrl: 'http://localhost:3001/v1/shape',
			authContextMiddleware: createMiddleware(async (context, next) => {
				context.set('authContext', {
					organization: { id: 'org-1' },
				} as never);
				await next();
			}),
			operatorAuthContextMiddleware: createMiddleware(async (_context, next) => next()),
			fetch: ((request) => {
				requests.push(String(request));
				return Promise.resolve(new Response('[]'));
			}) as typeof fetch,
		});

		for (const path of [
			'/sync/shapes/traps',
			'/sync/shapes/collections',
			'/sync/shapes/applications',
			'/sync/shapes/source-reductions',
			'/sync/shapes/outreach-actions',
			'/sync/shapes/biocontrol-actions',
			'/sync/shapes/service-requests',
			'/sync/shapes/requested-control-actions',
			'/sync/shapes/mission-items',
			'/sync/shapes/notification-registrations',
			'/sync/shapes/weather-sources',
		]) {
			const response = await app.request(path);
			const upstream = new URL(requests.at(-1) ?? '');
			const columns = upstream.searchParams.get('columns')?.split(',') ?? [];

			expect(response.status).toBe(200);
			// Raw/heavy geometry (geom binary + derived geojson) stays server-only and
			// must never sync. Centroid columns (lat, lng, geom_type) are trigger-
			// maintained real columns that DO sync — see serverOnlyGeometryColumns in
			// packages/sync descriptor-factory.
			expect(columns).not.toContain('geom');
			expect(columns).not.toContain('geojson');
		}
	});
});

describe('shape response caching', () => {
	/**
	 * Electric answers every shape request with `public, max-age=604800, …`,
	 * intended for a CDN in front of a public shape log. Forwarded from this proxy
	 * it told browsers to keep month-old, org-scoped, cookie-authorized snapshots
	 * on disk — which both desynced the Electric client from the current log
	 * position and made per-tenant rows storable by any shared cache.
	 *
	 * The bug was invisible in review and in the UI: the app rendered, and the
	 * client blamed a CDN that does not exist. Only the response headers said so,
	 * which is exactly why it is asserted here rather than left to be noticed.
	 */
	function electricResponse(): Response {
		return new Response('{"data":[]}', {
			headers: {
				'cache-control': 'public, max-age=604800, s-maxage=3600, stale-while-revalidate=2629746',
				'electric-handle': 'handle-1',
			},
		});
	}

	function appWithElectric(): Hono<{ Variables: AuthVariables }> {
		const app = new Hono<{ Variables: AuthVariables }>();
		registerSyncShapeRoutes(app, {
			electricUrl: 'http://localhost:3001/v1/shape',
			authContextMiddleware: createMiddleware(async (context, next) => {
				context.set('authContext', { organization: { id: 'org-1' } } as never);
				await next();
			}),
			operatorAuthContextMiddleware: createMiddleware(async (_context, next) => next()),
			fetch: (() => Promise.resolve(electricResponse())) as typeof fetch,
		});
		return app;
	}

	it('never forwards Electric’s public caching directive to the browser', async () => {
		const response = await appWithElectric().request('/sync/shapes/units');

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		// The specific failure: `public` on a cookie-authorized, org-scoped body.
		expect(response.headers.get('cache-control')).not.toContain('public');
		expect(response.headers.get('cache-control')).not.toContain('max-age');
	});

	it('varies on cookie so no shared cache keys two operators together', async () => {
		const response = await appWithElectric().request('/sync/shapes/units');

		expect(response.headers.get('vary')).toBe('cookie');
	});

	it('still forwards the Electric stream headers the client needs', async () => {
		const response = await appWithElectric().request('/sync/shapes/units');

		expect(response.headers.get('electric-handle')).toBe('handle-1');
		expect(response.headers.get('access-control-expose-headers')).toContain('electric-handle');
	});
});
