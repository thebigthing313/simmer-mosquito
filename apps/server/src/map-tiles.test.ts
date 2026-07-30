import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';
import {
	parseAddressTileFilters,
	parseHabitatDisplayQuery,
	parseHabitatTileFilters,
	parseInspectionDisplayQuery,
	parseInspectionTileFilters,
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

describe('parseAddressTileFilters', () => {
	it('parses a search filter through the address whitelist', () => {
		expect(parseAddressTileFilters(new URLSearchParams({ search: 'Main St' }))).toEqual({
			ok: true,
			filters: { search: 'Main St' },
		});
	});

	it('parses to empty filters when no params are given', () => {
		expect(parseAddressTileFilters(new URLSearchParams())).toEqual({
			ok: true,
			filters: {},
		});
	});

	it('rejects unknown filter params', () => {
		expect(parseAddressTileFilters(new URLSearchParams({ where: 'true' }))).toMatchObject({
			ok: false,
			reason: 'Unsupported address tile filter: where.',
		});
	});
});

describe('parseHabitatDisplayQuery', () => {
	it('parses bbox, limit, and habitat filters', () => {
		expect(
			parseHabitatDisplayQuery(
				new URLSearchParams({
					bbox: '-91,35,-90,36',
					limit: '25',
					isActive: 'true',
					isInaccessible: 'false',
				}),
				organizationId,
			),
		).toEqual({
			ok: true,
			input: {
				organizationId,
				bounds: {
					west: -91,
					south: 35,
					east: -90,
					north: 36,
				},
				filters: {
					isActive: true,
					isInaccessible: false,
				},
				limit: 25,
				offset: 0,
			},
		});
	});

	it('rejects invalid bbox and oversized limits', () => {
		expect(parseHabitatDisplayQuery(new URLSearchParams(), organizationId)).toMatchObject({
			ok: false,
			reason: 'bbox is required.',
		});
		expect(
			parseHabitatDisplayQuery(
				new URLSearchParams({
					bbox: '-91,35,-90,36',
					limit: '100',
				}),
				organizationId,
			),
		).toMatchObject({
			ok: false,
			reason: 'limit must be between 1 and 50.',
		});
	});
});

describe('registerMapTileRoutes', () => {
	it('returns authenticated habitat display rows scoped to the selected organization', async () => {
		const calls: unknown[] = [];
		const app = createApp({
			getHabitatTile: async () => new Uint8Array(),
			listHabitatDisplayRows: async (_db, input) => {
				calls.push(input);
				return {
					total: 1,
					rows: [
						{
							id: 'habitat-1',
							organizationId,
							lat: 35.5,
							lng: -90.5,
							geojson: { type: 'Point', coordinates: [-90.5, 35.5] },
							geomType: 'st_point',
							addressId: null,
							habitatTypeId: null,
							habitatName: 'Retention pond',
							description: '',
							isActive: true,
							isInaccessible: false,
							metadata: null,
							createdByProfileId: null,
							updatedByProfileId: null,
							createdAt: new Date('2026-05-01T00:00:00.000Z'),
							updatedAt: new Date('2026-05-02T00:00:00.000Z'),
						},
					],
				};
			},
		});

		const response = await app.request('/map/habitats?bbox=-91,35,-90,36&limit=10&isActive=true');

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			habitats: [
				{
					id: 'habitat-1',
					organizationId,
					lat: 35.5,
					lng: -90.5,
				},
			],
		});
		expect(calls).toEqual([
			{
				organizationId,
				bounds: {
					west: -91,
					south: 35,
					east: -90,
					north: 36,
				},
				filters: {
					isActive: true,
				},
				limit: 10,
				offset: 0,
			},
		]);
	});

	it('rejects invalid habitat display queries before reading rows', async () => {
		const listHabitatDisplayRows = vi.fn();
		const app = createApp({
			getHabitatTile: async () => new Uint8Array(),
			listHabitatDisplayRows,
		});

		const response = await app.request('/map/habitats?bbox=-91,35,-90,36&limit=99');

		await expect(response.json()).resolves.toMatchObject({ error: 'invalid_query' });
		expect(response.status).toBe(400);
		expect(listHabitatDisplayRows).not.toHaveBeenCalled();
	});

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

	it('returns authenticated address tiles scoped to the organization with the search filter', async () => {
		const calls: unknown[] = [];
		const tile = new Uint8Array([4, 5, 6]);
		const app = createApp({
			getHabitatTile: async () => new Uint8Array(),
			getAddressTile: async (_db, input) => {
				calls.push(input);
				return tile;
			},
		});

		const response = await app.request('/map/tiles/addresses/13/1310/3166.mvt?search=Main');

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/vnd.mapbox-vector-tile');
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(tile);
		expect(calls).toEqual([
			{
				z: 13,
				x: 1310,
				y: 3166,
				organizationId,
				filters: { search: 'Main' },
			},
		]);
	});

	it('rejects unknown address tile filters before reading tiles', async () => {
		const getAddressTile = vi.fn();
		const app = createApp({ getHabitatTile: async () => new Uint8Array(), getAddressTile });

		const response = await app.request('/map/tiles/addresses/0/0/0.mvt?where=1');

		await expect(response.json()).resolves.toMatchObject({ error: 'invalid_filter' });
		expect(response.status).toBe(400);
		expect(getAddressTile).not.toHaveBeenCalled();
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

		const response = await app.request('/map/tiles/nonexistent-tileset/0/0/0.mvt');

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

	it('returns the filtered habitat extent scoped to the selected organization', async () => {
		const calls: unknown[] = [];
		const app = createApp({
			getHabitatTile: async () => new Uint8Array(),
			getHabitatExtent: async (_db, input) => {
				calls.push(input);
				return { west: -90.6, south: 35.4, east: -90.4, north: 35.6 };
			},
		});

		const response = await app.request('/map/tiles/habitats/extent?isActive=true&search=pond');

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			extent: { west: -90.6, south: 35.4, east: -90.4, north: 35.6 },
		});
		expect(calls).toEqual([{ organizationId, filters: { isActive: true, search: 'pond' } }]);
	});

	it('returns a null extent when no record matches the filters', async () => {
		const app = createApp({
			getHabitatTile: async () => new Uint8Array(),
			getHabitatExtent: async () => null,
		});

		const response = await app.request('/map/tiles/habitats/extent');

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ extent: null });
	});

	it('resolves the region extent to an explicit id set', async () => {
		const calls: unknown[] = [];
		const app = createApp({
			getHabitatTile: async () => new Uint8Array(),
			getRegionExtent: async (_db, input) => {
				calls.push(input);
				return null;
			},
		});

		const response = await app.request(`/map/tiles/regions/extent?id=${regionId}`);

		expect(response.status).toBe(200);
		expect(calls).toEqual([{ organizationId, filters: { ids: [regionId] } }]);
	});

	it('rejects unknown tilesets and invalid filters before reading an extent', async () => {
		const getHabitatExtent = vi.fn();
		const app = createApp({ getHabitatTile: async () => new Uint8Array(), getHabitatExtent });

		const unknownTileset = await app.request('/map/tiles/nonexistent-tileset/extent');
		const invalidFilter = await app.request('/map/tiles/habitats/extent?isActive=maybe');

		await expect(unknownTileset.json()).resolves.toMatchObject({ error: 'invalid_tileset' });
		expect(unknownTileset.status).toBe(400);
		await expect(invalidFilter.json()).resolves.toMatchObject({ error: 'invalid_filter' });
		expect(invalidFilter.status).toBe(400);
		expect(getHabitatExtent).not.toHaveBeenCalled();
	});

	it('requires auth before reading an extent', async () => {
		const getHabitatExtent = vi.fn();
		const app = createApp({
			authenticated: false,
			getHabitatTile: async () => new Uint8Array(),
			getHabitatExtent,
		});

		const response = await app.request('/map/tiles/habitats/extent');

		await expect(response.json()).resolves.toEqual({ error: 'unauthenticated' });
		expect(response.status).toBe(401);
		expect(getHabitatExtent).not.toHaveBeenCalled();
	});

	it('returns a single habitat display row scoped to the selected organization', async () => {
		const calls: unknown[] = [];
		const app = createApp({
			getHabitatTile: async () => new Uint8Array(),
			getHabitatDisplayRow: async (_db, input) => {
				calls.push(input);
				return {
					id: habitatId,
					organizationId,
					lat: 35.5,
					lng: -90.5,
					geojson: { type: 'Point', coordinates: [-90.5, 35.5] },
					geomType: 'st_point',
					addressId: null,
					habitatTypeId: null,
					habitatName: 'Retention pond',
					description: '',
					isActive: true,
					isInaccessible: false,
					metadata: null,
					createdByProfileId: null,
					updatedByProfileId: null,
					createdAt: new Date('2026-05-01T00:00:00.000Z'),
					updatedAt: new Date('2026-05-02T00:00:00.000Z'),
				};
			},
		});

		const response = await app.request(`/map/habitats/${habitatId}`);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			habitat: { id: habitatId, organizationId, lat: 35.5, lng: -90.5 },
		});
		expect(calls).toEqual([{ id: habitatId, organizationId }]);
	});

	it('returns 404 when the habitat is not found', async () => {
		const app = createApp({
			getHabitatTile: async () => new Uint8Array(),
			getHabitatDisplayRow: async () => undefined,
		});

		const response = await app.request(`/map/habitats/${habitatId}`);

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toMatchObject({ error: 'not_found' });
	});

	it('rejects a non-UUID habitat id before reading rows', async () => {
		const getHabitatDisplayRow = vi.fn();
		const app = createApp({
			getHabitatTile: async () => new Uint8Array(),
			getHabitatDisplayRow,
		});

		const response = await app.request('/map/habitats/not-a-uuid');

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ error: 'invalid_id' });
		expect(getHabitatDisplayRow).not.toHaveBeenCalled();
	});

	it('returns active-habitat usage counts scoped to the selected organization', async () => {
		const calls: unknown[] = [];
		const app = createApp({
			getHabitatTile: async () => new Uint8Array(),
			countHabitatTypeUsage: async (_db, input) => {
				calls.push(input);
				return [{ habitatTypeId, activeCount: 4 }];
			},
		});

		const response = await app.request('/map/habitats/type-usage');

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			usage: [{ habitatTypeId, activeCount: 4 }],
		});
		expect(calls).toEqual([{ organizationId }]);
	});

	it('resolves type-usage to the literal route rather than the id param', async () => {
		const getHabitatDisplayRow = vi.fn();
		const app = createApp({
			getHabitatTile: async () => new Uint8Array(),
			getHabitatDisplayRow,
			countHabitatTypeUsage: async () => [],
		});

		const response = await app.request('/map/habitats/type-usage');

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ usage: [] });
		expect(getHabitatDisplayRow).not.toHaveBeenCalled();
	});

	it('requires auth before reading usage counts', async () => {
		const countHabitatTypeUsage = vi.fn();
		const app = createApp({
			authenticated: false,
			getHabitatTile: async () => new Uint8Array(),
			countHabitatTypeUsage,
		});

		const response = await app.request('/map/habitats/type-usage');

		expect(response.status).toBe(401);
		expect(countHabitatTypeUsage).not.toHaveBeenCalled();
	});
});

describe('parseInspectionTileFilters', () => {
	it('parses wetness, density, positive, type, and date filters', () => {
		expect(
			parseInspectionTileFilters(
				new URLSearchParams({
					isWet: 'true',
					density: 'heavy,very_heavy',
					positive: 'true',
					habitatTypeId: '4fe25a2d-925c-4d37-9d4e-07185ad19858',
					dateFrom: '2026-04-27',
					dateTo: '2026-05-27',
				}),
			),
		).toEqual({
			ok: true,
			filters: {
				isWet: true,
				densities: ['heavy', 'very_heavy'],
				positiveOnly: true,
				habitatTypeIds: ['4fe25a2d-925c-4d37-9d4e-07185ad19858'],
				dateFrom: '2026-04-27',
				dateTo: '2026-05-27',
			},
		});
	});

	it('rejects an unknown density value', () => {
		expect(parseInspectionTileFilters(new URLSearchParams({ density: 'swarming' }))).toMatchObject({
			ok: false,
			reason: 'density must be one of: none, light, medium, heavy, very_heavy.',
		});
	});

	it('rejects a malformed date filter', () => {
		expect(
			parseInspectionTileFilters(new URLSearchParams({ dateFrom: '2026-13-40' })),
		).toMatchObject({
			ok: false,
			reason: 'dateFrom must be a valid YYYY-MM-DD date.',
		});
	});

	it('rejects unknown filter params', () => {
		expect(parseInspectionTileFilters(new URLSearchParams({ isActive: 'true' }))).toMatchObject({
			ok: false,
			reason: 'Unsupported inspection tile filter: isActive.',
		});
	});
});

describe('parseInspectionDisplayQuery', () => {
	it('parses bbox, limit, and inspection filters', () => {
		expect(
			parseInspectionDisplayQuery(
				new URLSearchParams({
					bbox: '-91,35,-90,36',
					limit: '25',
					isWet: 'true',
					density: 'medium',
				}),
				organizationId,
			),
		).toEqual({
			ok: true,
			input: {
				organizationId,
				bounds: { west: -91, south: 35, east: -90, north: 36 },
				filters: { isWet: true, densities: ['medium'] },
				limit: 25,
				offset: 0,
			},
		});
	});

	it('rejects an oversized limit before reading rows', () => {
		expect(
			parseInspectionDisplayQuery(
				new URLSearchParams({ bbox: '-91,35,-90,36', limit: '500' }),
				organizationId,
			),
		).toMatchObject({ ok: false, reason: 'limit must be between 1 and 50.' });
	});
});

describe('registerMapTileRoutes — inspections', () => {
	it('returns authenticated inspection display rows scoped to the organization', async () => {
		const calls: unknown[] = [];
		const app = createApp({
			getHabitatTile: async () => new Uint8Array(),
			listInspectionDisplayRows: async (_db, input) => {
				calls.push(input);
				return { total: 1, rows: [sampleInspectionRow] };
			},
		});

		const response = await app.request(
			'/map/inspections?bbox=-91,35,-90,36&limit=10&isWet=true&density=heavy',
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			inspections: [{ id: inspectionId, organizationId, density: 'heavy' }],
		});
		expect(calls).toEqual([
			{
				organizationId,
				bounds: { west: -91, south: 35, east: -90, north: 36 },
				filters: { isWet: true, densities: ['heavy'] },
				limit: 10,
				offset: 0,
			},
		]);
	});

	it('rejects invalid inspection display queries before reading rows', async () => {
		const listInspectionDisplayRows = vi.fn();
		const app = createApp({
			getHabitatTile: async () => new Uint8Array(),
			listInspectionDisplayRows,
		});

		const response = await app.request('/map/inspections?bbox=-91,35,-90,36&density=swarming');

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ error: 'invalid_query' });
		expect(listInspectionDisplayRows).not.toHaveBeenCalled();
	});

	it('returns authenticated inspection tiles scoped to the organization', async () => {
		const calls: unknown[] = [];
		const tile = new Uint8Array([4, 5, 6]);
		const app = createApp({
			getHabitatTile: async () => new Uint8Array(),
			getInspectionTile: async (_db, input) => {
				calls.push(input);
				return tile;
			},
		});

		const response = await app.request(
			'/map/tiles/inspections/13/1310/3166.mvt?isWet=true&density=very_heavy',
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
				filters: { isWet: true, densities: ['very_heavy'] },
			},
		]);
	});

	it('returns a single inspection display row scoped to the organization', async () => {
		const calls: unknown[] = [];
		const app = createApp({
			getHabitatTile: async () => new Uint8Array(),
			getInspectionDisplayRow: async (_db, input) => {
				calls.push(input);
				return sampleInspectionRow;
			},
		});

		const response = await app.request(`/map/inspections/${inspectionId}`);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			inspection: { id: inspectionId, organizationId },
		});
		expect(calls).toEqual([{ id: inspectionId, organizationId }]);
	});

	it('returns 404 when the inspection is not found', async () => {
		const app = createApp({
			getHabitatTile: async () => new Uint8Array(),
			getInspectionDisplayRow: async () => undefined,
		});

		const response = await app.request(`/map/inspections/${inspectionId}`);

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toMatchObject({ error: 'not_found' });
	});

	it('rejects a non-UUID inspection id before reading rows', async () => {
		const getInspectionDisplayRow = vi.fn();
		const app = createApp({
			getHabitatTile: async () => new Uint8Array(),
			getInspectionDisplayRow,
		});

		const response = await app.request('/map/inspections/not-a-uuid');

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ error: 'invalid_id' });
		expect(getInspectionDisplayRow).not.toHaveBeenCalled();
	});
});

function createApp(options: {
	readonly authenticated?: boolean;
	readonly getHabitatTile: NonNullable<
		Parameters<typeof registerMapTileRoutes>[1]['getHabitatTile']
	>;
	readonly listHabitatDisplayRows?: NonNullable<
		Parameters<typeof registerMapTileRoutes>[1]['listHabitatDisplayRows']
	>;
	readonly getHabitatDisplayRow?: NonNullable<
		Parameters<typeof registerMapTileRoutes>[1]['getHabitatDisplayRow']
	>;
	readonly countHabitatTypeUsage?: NonNullable<
		Parameters<typeof registerMapTileRoutes>[1]['countHabitatTypeUsage']
	>;
	readonly getInspectionTile?: NonNullable<
		Parameters<typeof registerMapTileRoutes>[1]['getInspectionTile']
	>;
	readonly listInspectionDisplayRows?: NonNullable<
		Parameters<typeof registerMapTileRoutes>[1]['listInspectionDisplayRows']
	>;
	readonly getInspectionDisplayRow?: NonNullable<
		Parameters<typeof registerMapTileRoutes>[1]['getInspectionDisplayRow']
	>;
	readonly getAddressTile?: NonNullable<
		Parameters<typeof registerMapTileRoutes>[1]['getAddressTile']
	>;
	readonly getHabitatExtent?: NonNullable<
		Parameters<typeof registerMapTileRoutes>[1]['getHabitatExtent']
	>;
	readonly getRegionExtent?: NonNullable<
		Parameters<typeof registerMapTileRoutes>[1]['getRegionExtent']
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
		...(options.listHabitatDisplayRows === undefined
			? {}
			: { listHabitatDisplayRows: options.listHabitatDisplayRows }),
		...(options.getHabitatDisplayRow === undefined
			? {}
			: { getHabitatDisplayRow: options.getHabitatDisplayRow }),
		...(options.countHabitatTypeUsage === undefined
			? {}
			: { countHabitatTypeUsage: options.countHabitatTypeUsage }),
		...(options.getInspectionTile === undefined
			? {}
			: { getInspectionTile: options.getInspectionTile }),
		...(options.listInspectionDisplayRows === undefined
			? {}
			: { listInspectionDisplayRows: options.listInspectionDisplayRows }),
		...(options.getInspectionDisplayRow === undefined
			? {}
			: { getInspectionDisplayRow: options.getInspectionDisplayRow }),
		...(options.getAddressTile === undefined ? {} : { getAddressTile: options.getAddressTile }),
		...(options.getHabitatExtent === undefined
			? {}
			: { getHabitatExtent: options.getHabitatExtent }),
		...(options.getRegionExtent === undefined ? {} : { getRegionExtent: options.getRegionExtent }),
	});
	return app;
}

const organizationId = 'f0dbf1c7-d278-441e-82b4-9292d390ce72';
const regionId = 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f';
const habitatId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const habitatTypeId = '4fe25a2d-925c-4d37-9d4e-07185ad19858';
const inspectionId = 'b7c8d9e0-f1a2-4b3c-8d4e-5f6a7b8c9d0e';

const authContext = {
	organization: { id: organizationId },
} as AuthContext;

const sampleInspectionRow = {
	id: inspectionId,
	organizationId,
	lat: 35.5,
	lng: -90.5,
	geojson: { type: 'Point', coordinates: [-90.5, 35.5] },
	geomType: 'st_point',
	habitatId,
	habitatName: 'Retention pond',
	habitatTypeId,
	addressId: null,
	addressDisplayName: null,
	inspectedByProfileId: null,
	inspectedByName: null,
	inspectionDate: '2026-05-27',
	isWet: true,
	dipCount: 5,
	density: 'heavy',
	larvaeCount: 42,
	hasEggs: false,
	hasFirstInstar: true,
	hasSecondInstar: true,
	hasThirdInstar: false,
	hasFourthInstar: false,
	hasPupae: false,
	createdAt: new Date('2026-05-27T00:00:00.000Z'),
	updatedAt: new Date('2026-05-27T00:00:00.000Z'),
} as const;
