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
});

describe('registerSyncShapeRoutes', () => {
	it.each([['/sync/shapes/insecticides']])('registers %s', async (path) => {
		const app = new Hono<{ Variables: AuthVariables }>();

		registerSyncShapeRoutes(app, {
			db: {} as never,
			electricUrl: null,
			authContextMiddleware: createMiddleware(async (_context, next) => next()),
			operatorAuthContextMiddleware: createMiddleware(async (_context, next) => next()),
		});

		const response = await app.request(path);

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: 'electric_url_required' });
	});

	it('registers org-scoped insecticide batch shapes without parent lookups', async () => {
		const app = new Hono<{ Variables: AuthVariables }>();
		const requests: string[] = [];

		registerSyncShapeRoutes(app, {
			db: {} as never,
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

		const response = await app.request('/sync/shapes/insecticide-batches/insecticide-1');
		const upstream = new URL(requests[0] ?? '');

		expect(response.status).toBe(200);
		expect(upstream.searchParams.get('table')).toBe('insecticide_batches');
		expect(upstream.searchParams.get('columns')).toContain('organization_id');
		expect(upstream.searchParams.get('where')).toBe(
			'organization_id = $1 and insecticide_id = $2 and deleted_at is null',
		);
		expect(upstream.searchParams.get('params[1]')).toBe('org-1');
		expect(upstream.searchParams.get('params[2]')).toBe('insecticide-1');
	});
});
