import { describe, expect, it } from 'vitest';
import {
	flattenPolygons,
	parseGeoJson,
	parseKmlCoordinates,
	parseRegionsFromFile,
} from './-import-parse';

const square = [
	[0, 0],
	[0, 1],
	[1, 1],
	[1, 0],
	[0, 0],
];
const square2 = [
	[2, 2],
	[2, 3],
	[3, 3],
	[3, 2],
	[2, 2],
];

describe('parseGeoJson', () => {
	it('reads named polygons and flattens multipolygons, skipping non-polygons', () => {
		const geojson = JSON.stringify({
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					properties: { name: 'North' },
					geometry: { type: 'Polygon', coordinates: [square] },
				},
				{
					type: 'Feature',
					properties: { name: 'Split' },
					geometry: { type: 'MultiPolygon', coordinates: [[square], [square2]] },
				},
				{
					type: 'Feature',
					properties: { name: 'A point' },
					geometry: { type: 'Point', coordinates: [5, 5] },
				},
			],
		});

		const result = parseGeoJson(geojson);

		expect(result.skipped).toBe(1);
		expect(result.regions.map((r) => r.name)).toEqual(['North', 'Split (1)', 'Split (2)']);
		expect(result.regions[0]?.geometry.type).toBe('Polygon');
		expect(result.regions[1]?.geometry.coordinates[0]).toEqual(square);
		expect(result.regions[2]?.geometry.coordinates[0]).toEqual(square2);
	});

	it('falls back to positional names when features are unnamed', () => {
		const geojson = JSON.stringify({
			type: 'Feature',
			properties: {},
			geometry: { type: 'Polygon', coordinates: [square] },
		});
		const result = parseGeoJson(geojson);
		expect(result.regions).toHaveLength(1);
		expect(result.regions[0]?.name).toBe('Region 1');
	});
});

describe('flattenPolygons', () => {
	it('recurses geometry collections and drops non-areal members', () => {
		const polygons = flattenPolygons({
			type: 'GeometryCollection',
			geometries: [
				{ type: 'Polygon', coordinates: [square] },
				{
					type: 'LineString',
					coordinates: [
						[0, 0],
						[1, 1],
					],
				},
				{ type: 'MultiPolygon', coordinates: [[square2]] },
			],
		});
		expect(polygons).toHaveLength(2);
		expect(polygons.every((p) => p.type === 'Polygon')).toBe(true);
	});

	it('rejects rings with too few points', () => {
		expect(
			flattenPolygons({
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[1, 1],
					],
				],
			}),
		).toEqual([]);
	});
});

describe('parseKmlCoordinates', () => {
	it('parses whitespace-separated lon,lat[,alt] tuples and drops altitude', () => {
		const ring = parseKmlCoordinates('\n  0,0,0 0,1,0\n1,1 1,0 0,0  ');
		expect(ring).toEqual([
			[0, 0],
			[0, 1],
			[1, 1],
			[1, 0],
			[0, 0],
		]);
	});
});

describe('parseRegionsFromFile', () => {
	it('dispatches GeoJSON by extension', () => {
		const result = parseRegionsFromFile(
			JSON.stringify({ type: 'Polygon', coordinates: [square] }),
			'boundaries.geojson',
		);
		expect(result.error).toBeUndefined();
		expect(result.regions).toHaveLength(1);
	});

	it('returns an error for malformed input instead of throwing', () => {
		const result = parseRegionsFromFile('{ not json', 'broken.geojson');
		expect(result.error).toBeDefined();
		expect(result.regions).toEqual([]);
	});
});
