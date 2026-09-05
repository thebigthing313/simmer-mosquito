import { tableSchemas } from '@simmer-mosquito/sync';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it } from 'vitest';
import type { AuthVariables } from '../../auth-middleware.js';
import { isServedScope, syncShapeScopes } from '../../shape-scopes.js';
import {
	buildElectricShapeRequest,
	buildElectricShapeUrl,
	registerSyncShapeRoutes,
} from '../../sync-shapes.js';

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
				incomingUrl: 'http://localhost:3000/sync/shapes/organizations',
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
			incomingUrl: 'http://localhost:3000/sync/shapes/route_items?offset=-1&handle=shape-1',
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

/**
 * The `where` each shape must reach Electric with, written out here rather than
 * derived from the map the routes read.
 *
 * That is the point of it: `shape-scopes.ts` says which scope a table has and
 * `sync-shapes.ts` turns a scope into SQL, so a test that consulted either would
 * agree with itself no matter what they said. This is the SQL, by table, checked
 * against what actually reached Electric.
 *
 * Everything defaults to the org-scoped, soft-delete-aware predicate; the
 * exceptions are listed. The two `organization_id = $1`-only entries are not a
 * decision to expose deleted rows — `memberships` and `weather_summaries` have no
 * `deleted_at` column, and naming one in their shape is an Electric error.
 */
const orgScopedWhere = 'organization_id = $1 and deleted_at is null';
const shapeWhereByTable: Readonly<Record<string, string | null>> = {
	// Global reference data every organization reads — no tenant predicate at
	// all.
	units: null,
	genera: null,
	species: null,
	memberships: 'organization_id = $1',
	organizations: 'id = $1 and deleted_at is null',
	weather_sources: '(organization_id = $1 or organization_id is null) and deleted_at is null',
	weather_summaries: '(organization_id = $1 or organization_id is null)',
};

/** Every table with a route, and the columns its schema says it may carry. */
const servedTables = Object.entries(syncShapeScopes)
	.filter(([, entry]) => isServedScope(entry))
	.map(([table]) => table);

function recordingApp(requests: string[]): Hono<{ Variables: AuthVariables }> {
	const app = new Hono<{ Variables: AuthVariables }>();

	registerSyncShapeRoutes(app, {
		electricUrl: 'http://localhost:3001/v1/shape',
		authContextMiddleware: createMiddleware(async (context, next) => {
			context.set('authContext', { organization: { id: 'org-1' } } as never);
			await next();
		}),
		operatorAuthContextMiddleware: createMiddleware(async (_context, next) => next()),
		fetch: ((request) => {
			requests.push(String(request));
			return Promise.resolve(new Response('[]'));
		}) as typeof fetch,
	});

	return app;
}

/**
 * The app as an operator meets it: the organization middleware refuses, the
 * operator one admits.
 */
function refusingOrganizationApp(requests: string[]): Hono<{ Variables: AuthVariables }> {
	const app = new Hono<{ Variables: AuthVariables }>();

	registerSyncShapeRoutes(app, {
		electricUrl: 'http://localhost:3001/v1/shape',
		authContextMiddleware: createMiddleware(async (context) =>
			context.json({ error: 'forbidden' }, 403),
		),
		operatorAuthContextMiddleware: createMiddleware(async (_context, next) => next()),
		fetch: ((request) => {
			requests.push(String(request));
			return Promise.resolve(new Response('[]'));
		}) as typeof fetch,
	});

	return app;
}

describe('registerSyncShapeRoutes', () => {
	it.each(
		servedTables,
	)('forces the table, columns and tenant scope of the %s shape', async (table) => {
		const requests: string[] = [];
		const response = await recordingApp(requests).request(`/sync/shapes/${table}`);
		const upstream = new URL(requests[0] ?? '');
		const declared = shapeWhereByTable[table];
		const expectedWhere = declared === undefined ? orgScopedWhere : declared;

		expect(response.status).toBe(200);
		expect(upstream.searchParams.get('table')).toBe(table);
		// The schema is the column list. Not a count against a second list — the
		// exact fields, so a column the schema gains reaches the shape and one it
		// withholds cannot.
		expect(upstream.searchParams.get('columns')?.split(',')).toEqual(
			Object.keys(tableSchemas[table as keyof typeof tableSchemas].shape),
		);
		expect(upstream.searchParams.get('where')).toBe(expectedWhere);
		expect(upstream.searchParams.get('params[1]')).toBe(expectedWhere === null ? null : 'org-1');
	});

	it('serves no shape for a table the scope map withholds', async () => {
		// `users` has no predicate that could scope it to an organization, so it
		// has no route at all rather than one that streams every login.
		const app = new Hono<{ Variables: AuthVariables }>();

		registerSyncShapeRoutes(app, {
			electricUrl: 'http://localhost:3001/v1/shape',
			authContextMiddleware: createMiddleware(async (_context, next) => next()),
			operatorAuthContextMiddleware: createMiddleware(async (_context, next) => next()),
		});

		expect((await app.request('/sync/shapes/users')).status).toBe(404);
	});

	it.each(
		servedTables.map((table) => [`/sync/shapes/${table}`] as const),
	)('registers %s for both GET and the POST subset transport', async (path) => {
		const app = new Hono<{ Variables: AuthVariables }>();

		registerSyncShapeRoutes(app, {
			electricUrl: null,
			authContextMiddleware: createMiddleware(async (_context, next) => next()),
			operatorAuthContextMiddleware: createMiddleware(async (_context, next) => next()),
		});

		for (const method of ['GET', 'POST']) {
			const response = await app.request(path, {
				method,
				...(method === 'POST'
					? { headers: { 'content-type': 'application/json' }, body: '{}' }
					: {}),
			});

			expect(response.status).toBe(503);
			expect(await response.json()).toEqual({ error: 'electric_url_required' });
		}
	});

	it.each([
		['/sync/shapes/units', 'units'],
		['/sync/shapes/genera', 'genera'],
		['/sync/shapes/species', 'species'],
	])('serves %s with no tenant predicate', async (path, table) => {
		const requests: string[] = [];
		const response = await recordingApp(requests).request(path);
		const upstream = new URL(requests[0] ?? '');

		expect(response.status).toBe(200);
		expect(upstream.searchParams.get('table')).toBe(table);
		// The highest-privilege path in the file: the global catalogs, no `where`.
		// Being signed in — as an organization member or as SIMMER — is the only
		// thing standing in front of it.
		expect(upstream.searchParams.get('where')).toBeNull();
		expect(upstream.searchParams.get('params[1]')).toBeNull();
	});

	/*
	 * These three were registered a second time under `/admin`, behind the
	 * operator middleware, because `apps/admin` could not reach the ordinary
	 * path. The prefix is gone; the ordinary path admits either identity, because
	 * a `global` shape forces no predicate and its handler reads no organization
	 * context.
	 *
	 * A 404 rather than a 403 is the point: the routes do not exist, so nothing
	 * can be reached through them if the wider door on the ordinary path is ever
	 * narrowed again.
	 */
	it.each([
		'/admin/sync/shapes/units',
		'/admin/sync/shapes/genera',
		'/admin/sync/shapes/species',
	])('no longer serves %s', async (path) => {
		const response = await recordingApp([]).request(path);

		expect(response.status).toBe(404);
	});

	/**
	 * The whole reason the prefix could go: an operator session has no
	 * organization context, so it fails the organization middleware, and a
	 * `global` shape does not need one.
	 */
	it('admits an operator on a global shape the organization middleware refuses', async () => {
		const requests: string[] = [];
		const response = await refusingOrganizationApp(requests).request('/sync/shapes/genera');

		expect(response.status).toBe(200);
		expect(new URL(requests[0] ?? '').searchParams.get('table')).toBe('genera');
	});

	/*
	 * And the half that keeps it safe. A tenant-scoped shape reached without an
	 * organization context would not fail loudly — `shapeScopeFilter` would read
	 * `undefined` — so the wider door must not be on it at all. The scope decides
	 * which middleware a route gets, so this is structural rather than a list
	 * someone maintains.
	 */
	it('does not admit an operator on a tenant-scoped shape', async () => {
		const response = await refusingOrganizationApp([]).request('/sync/shapes/habitats');

		expect(response.status).toBe(403);
	});

	it('asks for the column names Postgres has, with no case conversion', async () => {
		const requests: string[] = [];
		await recordingApp(requests).request('/sync/shapes/organizations');
		const columns = new URL(requests[0] ?? '').searchParams.get('columns')?.split(',') ?? [];

		expect(columns).toContain('workos_organization_id');
		expect(columns).toContain('updated_by_profile_id');
		// The numbered address columns were four hand-written exceptions to a
		// camel→snake pass, which is exactly the class of thing that no longer exists:
		// the schema field IS the column name.
		expect(columns).toContain('mailing_address_line_1');
		expect(columns).toContain('mailing_address_line_2');
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

		const response = await app.request('/sync/shapes/insecticide_batches');
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

		const response = await app.request('/sync/shapes/route_items', {
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

		const response = await app.request('/sync/shapes/route_items', {
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
			'/sync/shapes/source_reductions',
			'/sync/shapes/outreach_actions',
			'/sync/shapes/biocontrol_actions',
			'/sync/shapes/service_requests',
			'/sync/shapes/requested_control_actions',
			'/sync/shapes/mission_items',
			'/sync/shapes/notification_registrations',
			'/sync/shapes/weather_sources',
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
				// Electric names its own readable headers. The proxy drops the list
				// rather than forwarding it; see the expose-list case below.
				'access-control-expose-headers': 'electric-handle, electric-offset',
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

	it('drops hop-by-hop headers rather than describing a body it no longer has', async () => {
		const app = new Hono<{ Variables: AuthVariables }>();
		registerSyncShapeRoutes(app, {
			electricUrl: 'http://localhost:3001/v1/shape',
			authContextMiddleware: createMiddleware(async (context, next) => {
				context.set('authContext', { organization: { id: 'org-1' } } as never);
				await next();
			}),
			operatorAuthContextMiddleware: createMiddleware(async (_context, next) => next()),
			fetch: (() =>
				Promise.resolve(
					new Response('{"data":[]}', {
						headers: {
							// Electric's framing of *its* response body. Forwarded verbatim they
							// describe a body this proxy has already re-framed, and the browser
							// fails the stream rather than the request.
							'content-encoding': 'gzip',
							'transfer-encoding': 'chunked',
							connection: 'keep-alive',
							'electric-offset': '0_0',
						},
					}),
				)) as typeof fetch,
		});

		const response = await app.request('/sync/shapes/units');

		expect(response.headers.get('content-encoding')).toBeNull();
		expect(response.headers.get('transfer-encoding')).toBeNull();
		expect(response.headers.get('connection')).toBeNull();
		expect(response.headers.get('electric-offset')).toBe('0_0');
	});

	it('still forwards the Electric stream headers the client needs', async () => {
		const response = await appWithElectric().request('/sync/shapes/units');

		expect(response.headers.get('electric-handle')).toBe('handle-1');
	});

	it('writes no expose list of its own, because the CORS table owns that one', async () => {
		// Whatever this handler set was replaced anyway: Hono's `cors()` runs after
		// it and overwrites the header. Two answers where only one lands is how the
		// wrong one gets maintained, so the table is the only declaration and
		// `cors-options.test.ts` is what holds it. Electric's own list is dropped on
		// the way through for the same reason.
		const response = await appWithElectric().request('/sync/shapes/units');

		expect(response.headers.get('access-control-expose-headers')).toBeNull();
	});
});
