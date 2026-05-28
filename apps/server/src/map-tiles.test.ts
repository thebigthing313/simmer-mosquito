import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';
import {
	parseHabitatTileFilters,
	parseTileCoordinate,
	registerMapTileRoutes,
} from './map-tiles.js';

describe('parseTileCoordinate', () => {
	it('accepts in-range Web Mercator tile coordinates with an mvt extension', () => {
		expect(parseTileCoordinate({ z: '13', x: '1310', yWithExtension: '3166.mvt' })).toEqual({
			ok: true,
			coordinate: {
				z: 13,
				x: 1310,
				y: 3166,
			},
		});
	});

	it('rejects coordinates outside the z tile range', () => {
		expect(parseTileCoordinate({ z: '1', x: '2', yWithExtension: '0.mvt' })).toMatchObject({
			ok: false,
		});
	});
});

describe('parseHabitatTileFilters', () => {
	it('parses boolean and UUID filters through the habitat whitelist', () => {
		const filters = parseHabitatTileFilters(
			new URLSearchParams({
				isActive: 'true',
				isInaccessible: 'false',
				habitatTypeId: '4fe25a2d-925c-4d37-9d4e-07185ad19858,e6d99dd0-9dcb-4dab-a47d-11e74cd46be1',
			}),
		);

		expect(filters).toEqual({
			ok: true,
			filters: {
				isActive: true,
				isInaccessible: false,
				habitatTypeIds: [
					'4fe25a2d-925c-4d37-9d4e-07185ad19858',
					'e6d99dd0-9dcb-4dab-a47d-11e74cd46be1',
				],
			},
		});
	});

	it('rejects invalid boolean filters', () => {
		expect(parseHabitatTileFilters(new URLSearchParams({ isActive: 'yes' }))).toMatchObject({
			ok: false,
			reason: 'isActive must be true or false.',
		});
	});

	it('rejects invalid UUID filters', () => {
		expect(
			parseHabitatTileFilters(new URLSearchParams({ habitatTypeId: 'not-a-uuid' })),
		).toMatchObject({
			ok: false,
			reason: 'habitatTypeId must contain only UUID values.',
		});
	});

	it('rejects unknown filter params', () => {
		expect(parseHabitatTileFilters(new URLSearchParams({ where: 'true' }))).toMatchObject({
			ok: false,
			reason: 'Unsupported habitat tile filter: where.',
		});
	});
});

describe('registerMapTileRoutes', () => {
	it('returns authenticated habitat tiles scoped to the selected organization', async () => {
		const calls: unknown[] = [];
		const tile = new Uint8Array([1, 2, 3]);
		const app = createApp({
			getHabitatTile: async (_db, input) => {
				calls.push(input);
				return tile;
			},
		});

		const response = await app.request(
			'/map/tiles/habitats/13/1310/3166.mvt?isActive=true&habitatTypeId=4fe25a2d-925c-4d37-9d4e-07185ad19858',
		);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/vnd.mapbox-vector-tile');
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(tile);
		expect(calls).toEqual([
			{
				z: 13,
				x: 1310,
				y: 3166,
				organizationId,
				filters: {
					isActive: true,
					habitatTypeIds: ['4fe25a2d-925c-4d37-9d4e-07185ad19858'],
				},
			},
		]);
	});

	it('returns empty tile bytes with the MVT content type', async () => {
		const app = createApp({
			getHabitatTile: async () => new Uint8Array(),
		});

		const response = await app.request('/map/tiles/habitats/0/0/0.mvt');

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/vnd.mapbox-vector-tile');
		expect(await response.arrayBuffer()).toHaveProperty('byteLength', 0);
	});

	it('rejects unknown tilesets before reading tiles', async () => {
		const getHabitatTile = vi.fn();
		const app = createApp({ getHabitatTile });

		const response = await app.request('/map/tiles/traps/0/0/0.mvt');

		await expect(response.json()).resolves.toMatchObject({ error: 'invalid_tileset' });
		expect(response.status).toBe(400);
		expect(getHabitatTile).not.toHaveBeenCalled();
	});

	it('rejects invalid tile coordinates before reading tiles', async () => {
		const getHabitatTile = vi.fn();
		const app = createApp({ getHabitatTile });

		const response = await app.request('/map/tiles/habitats/2/4/0.mvt');

		await expect(response.json()).resolves.toMatchObject({ error: 'invalid_tile_coordinate' });
		expect(response.status).toBe(400);
		expect(getHabitatTile).not.toHaveBeenCalled();
	});

	it('rejects invalid filters before reading tiles', async () => {
		const getHabitatTile = vi.fn();
		const app = createApp({ getHabitatTile });

		const response = await app.request('/map/tiles/habitats/0/0/0.mvt?isInaccessible=maybe');

		await expect(response.json()).resolves.toMatchObject({ error: 'invalid_filter' });
		expect(response.status).toBe(400);
		expect(getHabitatTile).not.toHaveBeenCalled();
	});

	it('requires auth before reading tiles', async () => {
		const getHabitatTile = vi.fn();
		const app = createApp({
			authenticated: false,
			getHabitatTile,
		});

		const response = await app.request('/map/tiles/habitats/0/0/0.mvt');

		await expect(response.json()).resolves.toEqual({ error: 'unauthenticated' });
		expect(response.status).toBe(401);
		expect(getHabitatTile).not.toHaveBeenCalled();
	});
});

function createApp(options: {
	readonly authenticated?: boolean;
	readonly getHabitatTile: NonNullable<
		Parameters<typeof registerMapTileRoutes>[1]['getHabitatTile']
	>;
}) {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerMapTileRoutes(app, {
		db: {} as Parameters<typeof registerMapTileRoutes>[1]['db'],
		authContextMiddleware: createMiddleware(async (context, next) => {
			if (options.authenticated === false) {
				return context.json({ error: 'unauthenticated' }, 401);
			}

			context.set('authContext', authContext);
			await next();
		}),
		getHabitatTile: options.getHabitatTile,
	});
	return app;
}

const organizationId = 'f0dbf1c7-d278-441e-82b4-9292d390ce72';

const authContext = {
	organization: { id: organizationId },
} as AuthContext;
