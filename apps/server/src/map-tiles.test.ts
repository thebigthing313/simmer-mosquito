import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';
import {
	parseAddressTileFilters,
	parseApplicationMapFilters,
	parseBiocontrolMapFilters,
	parseCollectionMapFilters,
	parseHabitatDisplayQuery,
	parseHabitatTileFilters,
	parseInspectionDisplayQuery,
	parseInspectionTileFilters,
	parseOutreachMapFilters,
	parseRegionTileFilters,
	parseSampleTileFilters,
	parseSourceReductionMapFilters,
	parseTileCoordinate,
	parseTrapMapFilters,
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

// Every map surface takes the same `regionId` list, so a region deep link from
// one explorer stays readable by the next. Checked across three tilesets with
// different filter shapes to catch a whitelist that was updated in only one.
describe('region filter', () => {
	const first = '9a3d9e12-2a1c-4d5f-8f2b-6d0f47a03c31';
	const second = 'b7c0c1d4-8f43-4f6a-9d21-5f9a7b2e14aa';

	it('parses a region id list on the habitat, trap, and collection filters', () => {
		const params = new URLSearchParams({ regionId: `${first},${second}` });

		expect(parseHabitatTileFilters(params)).toEqual({
			ok: true,
			filters: { regionIds: [first, second] },
		});
		expect(parseTrapMapFilters(params)).toEqual({
			ok: true,
			filters: { regionIds: [first, second] },
		});
		expect(parseCollectionMapFilters(params)).toEqual({
			ok: true,
			filters: { regionIds: [first, second] },
		});
	});

	it('rejects a region id that is not a UUID', () => {
		expect(parseHabitatTileFilters(new URLSearchParams({ regionId: 'downtown' }))).toMatchObject({
			ok: false,
			reason: 'regionId must contain only UUID values.',
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

// The four routes whose readers were called directly rather than injected, so
// none of them could be driven without a database until the readers became one
// object. Three answer geometry the Electric shape does not carry (ADR 0009).
describe('map geometry routes', () => {
	it('answers a region with its geometry alone, scoped to the organization', async () => {
		const calls: unknown[] = [];
		const app = createApp({
			getRegionRow: async (_db, input) => {
				calls.push(input);
				return { id: regionId, organizationId, geometry, name: 'North' } as never;
			},
		});

		const response = await app.request(`/map/regions/${regionId}`);

		expect(response.status).toBe(200);
		// The name is deliberately absent: the row already streams on the region's
		// Electric shape, and only the polygon is missing there.
		await expect(response.json()).resolves.toEqual({ region: geometry });
		expect(calls).toEqual([{ id: regionId, organizationId }]);
	});

	it('answers an address with its geometry alone', async () => {
		const app = createApp({
			getAddressRow: async () => ({ id: addressId, organizationId, geometry }) as never,
		});

		const response = await app.request(`/map/addresses/${addressId}`);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ address: geometry });
	});

	it('answers a requested control action, and 404s for another agency’s', async () => {
		const app = createApp({
			getRequestedControlActionRow: async (_db, input) =>
				input.id === requestedControlActionId
					? ({ id: input.id, organizationId, ...geometry } as never)
					: undefined,
		});

		await expect(
			app.request(`/map/requested-control-actions/${requestedControlActionId}`),
		).resolves.toMatchObject({ status: 200 });

		const missing = await app.request(`/map/requested-control-actions/${regionId}`);
		expect(missing.status).toBe(404);
		await expect(missing.json()).resolves.toMatchObject({ error: 'not_found' });
	});

	it('answers every stop of one mission, in dispatch order', async () => {
		const calls: unknown[] = [];
		const app = createApp({
			listMissionItems: async (_db, input) => {
				calls.push(input);
				return [
					{ id: addressId, missionId, position: 1, ...geometry } as never,
					{ id: regionId, missionId, position: 2, ...geometry } as never,
				];
			},
		});

		const response = await app.request(`/map/missions/${missionId}/items`);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			missionItems: [{ position: 1 }, { position: 2 }],
		});
		// Per mission, not per stop — both mission surfaces draw a whole mission.
		expect(calls).toEqual([{ missionId, organizationId }]);
	});

	it('rejects a non-UUID mission id before reading geometry', async () => {
		const listMissionItems = vi.fn();
		const app = createApp({ listMissionItems });

		const response = await app.request('/map/missions/not-a-uuid/items');

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ error: 'invalid_id' });
		expect(listMissionItems).not.toHaveBeenCalled();
	});
});

/**
 * An app whose routes read from fakes.
 *
 * Every reader is nameable here, because `registerMapTileRoutes` takes one
 * `readers` object rather than forty-five optional fields. This used to be
 * seventy lines declaring ten of them by hand and spreading each conditionally,
 * so testing a route meant first widening the helper.
 */
function createApp(
	options: NonNullable<Parameters<typeof registerMapTileRoutes>[1]['readers']> & {
		readonly authenticated?: boolean;
	},
) {
	const { authenticated, ...readers } = options;
	const app = new Hono<{ Variables: AuthVariables }>();
	registerMapTileRoutes(app, {
		db: {} as Parameters<typeof registerMapTileRoutes>[1]['db'],
		authContextMiddleware: createMiddleware(async (context, next) => {
			if (authenticated === false) {
				return context.json({ error: 'unauthenticated' }, 401);
			}

			context.set('authContext', authContext);
			await next();
		}),
		readers,
	});
	return app;
}

const organizationId = 'f0dbf1c7-d278-441e-82b4-9292d390ce72';
const regionId = 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f';
const habitatId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const habitatTypeId = '4fe25a2d-925c-4d37-9d4e-07185ad19858';
const inspectionId = 'b7c8d9e0-f1a2-4b3c-8d4e-5f6a7b8c9d0e';
const addressId = '2b8f4c1a-7d63-4e59-9a02-3c5b7e1d8f40';
const requestedControlActionId = '6d1e9a37-4b28-4c5f-8e13-9f2a0b7c4d61';
const missionId = 'e9c2f480-15a6-4d73-8b21-7c40d5e9a382';

/** The owned geometry every geometry-only route answers with. */
const geometry = {
	lat: 35.5,
	lng: -90.5,
	geojson: { type: 'Point', coordinates: [-90.5, 35.5] },
	geomType: 'st_point',
} as const;

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

/**
 * Registration, for every tileset key and every route.
 *
 * The model is `sync-shapes.test.ts`: one table, one assertion per entry, no
 * fixture. It exists because a typo in a registry key — `'source-reduction'` is
 * the one with a hyphen, and `apps/web` has to spell it the same way — ships as
 * a 400 `invalid_tileset` with nothing failing, and because seven of the eleven
 * tilesets and nineteen of the twenty-seven routes were reached by no test at
 * all.
 *
 * Every case here is answered before the database is touched, which is what
 * makes the table cheap: an unknown tileset, a malformed tile coordinate, an
 * unknown filter param and a non-UUID id are all refusals the route makes on
 * its own. A registered route therefore answers 400; an unregistered one
 * answers 404, and that is the whole signal.
 */
describe('map read route registration', () => {
	const tileSets = [
		'habitats',
		'regions',
		'addresses',
		'inspections',
		'samples',
		'chemical',
		'source-reduction',
		'biocontrol',
		'outreach',
		'traps',
		'collections',
	] as const;

	function registrationApp() {
		return createApp({ getHabitatTile: () => Promise.resolve(new Uint8Array()) });
	}

	it.each(tileSets)('resolves the %s tileset for tiles', async (tileset) => {
		// Zoom 99 is past `maxSupportedZoom`, so the coordinate is refused — but
		// only after the registry has answered, which is what this asserts. An
		// unregistered key answers `invalid_tileset` here instead.
		const response = await registrationApp().request(`/map/tiles/${tileset}/99/0/0.mvt`);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ error: 'invalid_tile_coordinate' });
	});

	it.each(tileSets)('resolves the %s tileset for extents', async (tileset) => {
		const response = await registrationApp().request(`/map/tiles/${tileset}/extent?notAFilter=1`);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ error: 'invalid_filter' });
	});

	it('refuses a tileset key nothing registered', async () => {
		const response = await registrationApp().request('/map/tiles/nonexistent/99/0/0.mvt');

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ error: 'invalid_tileset' });
	});

	it.each([
		'/map/habitats',
		'/map/inspections',
		'/map/samples',
		'/map/chemical',
		'/map/source-reduction',
		'/map/biocontrol',
		'/map/outreach',
		'/map/traps',
		'/map/collections',
	])('registers %s and refuses a param its filters do not admit', async (path) => {
		const response = await registrationApp().request(`${path}?notAFilter=1`);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ error: 'invalid_query' });
	});

	it.each([
		'/map/habitats/not-a-uuid',
		'/map/regions/not-a-uuid',
		'/map/addresses/not-a-uuid',
		'/map/inspections/not-a-uuid',
		'/map/samples/not-a-uuid',
		'/map/chemical/not-a-uuid',
		'/map/source-reduction/not-a-uuid',
		'/map/biocontrol/not-a-uuid',
		'/map/outreach/not-a-uuid',
		'/map/requested-control-actions/not-a-uuid',
		'/map/missions/not-a-uuid/items',
		'/map/traps/not-a-uuid',
		'/map/collections/not-a-uuid',
	])('registers %s and refuses an id that is not a UUID', async (path) => {
		const response = await registrationApp().request(path);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ error: 'invalid_id' });
	});

	// The one read route with no unknown-param whitelist: it takes `search` and
	// `limit` and ignores the rest. An empty search short-circuits to no rows
	// without a query, which is what makes it assertable here.
	it('registers /map/habitats/search', async () => {
		const response = await registrationApp().request('/map/habitats/search?search=');

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ habitats: [] });
	});
});

/**
 * Every query param, mapped to the filter key the reader reads.
 *
 * The eleven parsers used to name each param twice — once in a whitelist `Set`,
 * once in the parse body — and are now one declarative table per surface. That
 * removed the drift between the two lists and introduced a different risk: the
 * table asserts its result type rather than deriving it, so a `param`/`as` pair
 * that names the wrong key still compiles. This is the assertion that catches
 * it, and it is why the table lists a value for every field rather than a
 * representative one.
 */
/**
 * Paging, for every surface that pages.
 *
 * `limit` and `offset` are not filters, and the filter parsers refuse a param
 * they do not admit — so the only thing standing between a paged request and a
 * 400 is `withoutPageParams` stripping them first. Nothing exercised that on
 * seven of the nine surfaces, and a regression there would not be subtle: every
 * paged read would answer `Unsupported <noun> filter: limit.`
 *
 * The reader is asserted on rather than the response, because `limit` reaching
 * the response body proves nothing — it is the value handed to the query that
 * decides what comes back.
 */
describe('paged map surfaces', () => {
	// Samples page *within a viewport*, so a bbox is required there and refused
	// as an unknown filter everywhere else — the control-operations surfaces draw
	// unbounded tiles and page the rail separately.
	const pagedSurfaces = [
		['/map/samples', 'listSampleDisplayRows', 'bbox=-91,35,-90,36&'],
		['/map/chemical', 'listApplicationDisplayRows', ''],
		['/map/source-reduction', 'listSourceReductionDisplayRows', ''],
		['/map/biocontrol', 'listBiocontrolDisplayRows', ''],
		['/map/outreach', 'listOutreachDisplayRows', ''],
		['/map/traps', 'listTrapDisplayRows', ''],
		['/map/collections', 'listCollectionDisplayRows', ''],
	] as const;

	function pagedApp(reader: (typeof pagedSurfaces)[number][1]) {
		const list = vi.fn(async () => ({ rows: [], total: 0 }));
		return { app: createApp({ [reader]: list } as never), list };
	}

	it.each(pagedSurfaces)('carries limit and offset through %s', async (path, reader, prefix) => {
		const { app, list } = pagedApp(reader);

		const response = await app.request(`${path}?${prefix}limit=5&offset=10`);

		expect(response.status).toBe(200);
		expect(list).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ organizationId, limit: 5, offset: 10 }),
		);
	});

	it.each(pagedSurfaces)('refuses an oversized limit on %s', async (path, reader, prefix) => {
		const { app, list } = pagedApp(reader);

		const response = await app.request(`${path}?${prefix}limit=100000`);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ error: 'invalid_query' });
		// Refused before the query, not after it came back too large.
		expect(list).not.toHaveBeenCalled();
	});

	// The date fields every one of these surfaces carries, and the one shape of
	// bad input a caller is most likely to send.
	it.each(pagedSurfaces)('refuses a malformed date on %s', async (path, reader, prefix) => {
		const { app, list } = pagedApp(reader);

		const response = await app.request(`${path}?${prefix}dateFrom=last-tuesday`);

		expect(response.status).toBe(400);
		expect(list).not.toHaveBeenCalled();
	});
});

/**
 * The two enum filters, whose rejection paths nothing reached.
 *
 * Both answer with the permitted values rather than a bare refusal, because the
 * caller is a URL somebody typed or a link somebody built, and neither can be
 * fixed from "invalid".
 */
describe('enum map filters', () => {
	it('refuses a sample status that is not one of the four, and names them', async () => {
		const app = createApp({ listSampleDisplayRows: async () => ({ rows: [], total: 0 }) });

		const response = await app.request('/map/samples?bbox=-91,35,-90,36&status=maybe');

		expect(response.status).toBe(400);
		const body = (await response.json()) as { readonly reason: string };
		expect(body.reason).toContain('status must be one of');
	});

	it('refuses a trap status that is not active or retired', async () => {
		const app = createApp({ listTrapDisplayRows: async () => ({ rows: [], total: 0 }) });

		const response = await app.request('/map/traps?status=broken');

		expect(response.status).toBe(400);
		const body = (await response.json()) as { readonly reason: string };
		expect(body.reason).toContain('status must be');
	});

	it('refuses an id that is not a UUID inside a list filter', async () => {
		const app = createApp({ listApplicationDisplayRows: async () => ({ rows: [], total: 0 }) });

		const response = await app.request('/map/chemical?insecticideId=not-a-uuid');

		expect(response.status).toBe(400);
		const body = (await response.json()) as { readonly reason: string };
		expect(body.reason).toContain('UUID');
	});
});

describe('map filter fields', () => {
	function filtersOf(
		parse: (params: URLSearchParams) => { ok: boolean },
		query: string,
	): Record<string, unknown> {
		const result = parse(new URLSearchParams(query)) as
			| { ok: true; filters: Record<string, unknown> }
			| { ok: false; reason: string };

		if (!result.ok) {
			throw new Error(result.reason);
		}
		return result.filters;
	}

	const idA = 'a1e0f1c7-d278-441e-82b4-9292d390ce72';
	const idB = 'b2e0f1c7-d278-441e-82b4-9292d390ce72';

	it('maps the region tile params', () => {
		expect(
			filtersOf(parseRegionTileFilters, `regionFolderId=folder&search=creek&id=${idA}`),
		).toEqual({ regionFolderId: 'folder', search: 'creek', ids: [idA] });
	});

	it('maps the sample tile params', () => {
		expect(
			filtersOf(
				parseSampleTileFilters,
				`species=${idA}&status=identified&nonMosquito=true&regionId=${idB}&dateFrom=2026-01-01&dateTo=2026-02-01`,
			),
		).toEqual({
			speciesIds: [idA],
			status: 'identified',
			nonMosquitoOnly: true,
			regionIds: [idB],
			dateFrom: '2026-01-01',
			dateTo: '2026-02-01',
		});
	});

	it('maps the chemical params', () => {
		expect(
			filtersOf(
				parseApplicationMapFilters,
				`insecticideId=${idA}&applicationMethodId=${idB}&applicator=${idA}&regionId=${idB}&dateFrom=2026-01-01&dateTo=2026-02-01`,
			),
		).toEqual({
			insecticideIds: [idA],
			applicationMethodIds: [idB],
			applicatorProfileIds: [idA],
			regionIds: [idB],
			dateFrom: '2026-01-01',
			dateTo: '2026-02-01',
		});
	});

	it('maps the source-reduction params', () => {
		expect(
			filtersOf(
				parseSourceReductionMapFilters,
				`sourceReductionMethodId=${idA}&technician=${idB}&regionId=${idA}`,
			),
		).toEqual({
			sourceReductionMethodIds: [idA],
			technicianProfileIds: [idB],
			regionIds: [idA],
		});
	});

	it('maps the biocontrol params', () => {
		expect(
			filtersOf(
				parseBiocontrolMapFilters,
				`biocontrolMethodId=${idA}&habitatLinked=true&technician=${idB}`,
			),
		).toEqual({
			biocontrolMethodIds: [idA],
			habitatLinkedOnly: true,
			technicianProfileIds: [idB],
		});
	});

	it('maps the outreach params', () => {
		expect(filtersOf(parseOutreachMapFilters, `outreachMethodId=${idA}&technician=${idB}`)).toEqual(
			{ outreachMethodIds: [idA], technicianProfileIds: [idB] },
		);
	});

	it('maps the trap params', () => {
		expect(
			filtersOf(parseTrapMapFilters, `collectionMethodId=${idA}&status=active&search=park`),
		).toEqual({ collectionMethodIds: [idA], isActive: true, search: 'park' });
	});

	it('maps the collection params', () => {
		expect(filtersOf(parseCollectionMapFilters, `collectionMethodId=${idA}&problem=true`)).toEqual({
			collectionMethodIds: [idA],
			problemOnly: true,
		});
	});

	// Three surfaces wrote this rule out longhand; it is one field kind now, so
	// one assertion covers all three.
	it.each([
		[parseSampleTileFilters, 'nonMosquito'],
		[parseBiocontrolMapFilters, 'habitatLinked'],
		[parseCollectionMapFilters, 'problem'],
	] as const)('drops %#: only true narrows', (parse, param) => {
		expect(filtersOf(parse, `${param}=false`)).toEqual({});
		expect(Object.values(filtersOf(parse, `${param}=true`))).toEqual([true]);
	});
});
