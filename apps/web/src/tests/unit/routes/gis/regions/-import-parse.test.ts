import { describe, expect, it } from 'vitest';
import {
	declareMissingNamespaces,
	flattenPolygons,
	MAX_POLYGONS,
	parseGeoJson,
	parseKmlCoordinates,
	parseRegionsFromFile,
} from '../../../../../routes/gis/regions/-import-parse';

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

	it('caps the import at MAX_POLYGONS, keeping the first ones', () => {
		const coordinates = Array.from({ length: MAX_POLYGONS + 50 }, () => [square]);
		const result = parseGeoJson(JSON.stringify({ type: 'MultiPolygon', coordinates }));
		expect(result.truncated).toBe(true);
		expect(result.regions).toHaveLength(MAX_POLYGONS);
	});

	it('does not flag truncation when under the cap', () => {
		const result = parseGeoJson(JSON.stringify({ type: 'Polygon', coordinates: [square] }));
		expect(result.truncated).toBe(false);
		expect(result.regions).toHaveLength(1);
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

describe('projected coordinates', () => {
	// State Plane feet: parses as GeoJSON, lands nowhere on earth.
	const projectedSquare = [
		[6_012_345, 1_876_543],
		[6_012_345, 1_876_643],
		[6_012_445, 1_876_643],
		[6_012_445, 1_876_543],
		[6_012_345, 1_876_543],
	];

	it('offers nothing from a file whose coordinates are all projected', () => {
		const result = parseGeoJson(
			JSON.stringify({ type: 'Polygon', coordinates: [projectedSquare] }),
		);
		expect(result.regions).toEqual([]);
		expect(result.projected).toBe(1);
	});

	it('offers only the WGS84 shapes from a mixed file and counts the rest', () => {
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
					properties: { name: 'Projected' },
					geometry: { type: 'Polygon', coordinates: [projectedSquare] },
				},
			],
		});

		const result = parseGeoJson(geojson);

		expect(result.regions.map((region) => region.name)).toEqual(['North']);
		expect(result.projected).toBe(1);
	});

	it('counts each part of a projected multipolygon', () => {
		const result = parseGeoJson(
			JSON.stringify({ type: 'MultiPolygon', coordinates: [[projectedSquare], [projectedSquare]] }),
		);
		expect(result.regions).toEqual([]);
		expect(result.projected).toBe(2);
	});

	it('reports nothing withheld for a fully valid file', () => {
		const result = parseGeoJson(JSON.stringify({ type: 'Polygon', coordinates: [square] }));
		expect(result.regions).toHaveLength(1);
		expect(result.projected).toBe(0);
	});

	it('reports nothing withheld when the file could not be parsed', () => {
		const result = parseRegionsFromFile('{ not json', 'broken.geojson');
		expect(result.projected).toBe(0);
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

describe('declareMissingNamespaces', () => {
	it('declares a used-but-undeclared prefix on the root and leaves valid files alone', () => {
		const broken =
			'<?xml version="1.0"?>\n' +
			'<kml xmlns:gx="urn:gx">\n' +
			'<Document xsi:schemaLocation="a b"><name>x</name></Document></kml>';
		const repaired = declareMissingNamespaces(broken);
		expect(repaired).not.toBeNull();
		expect(repaired).toContain('xmlns:xsi=');
		// The prefix is declared on the root <kml> element, before <Document>.
		expect((repaired ?? '').indexOf('xmlns:xsi=')).toBeLessThan(
			(repaired ?? '').indexOf('<Document'),
		);
		// gx is already declared, so it must not be re-added.
		expect((repaired ?? '').match(/xmlns:gx=/g)).toHaveLength(1);
	});

	it('returns null when every prefix is already declared', () => {
		const ok = '<kml xmlns:gx="urn:gx"><gx:Tour /></kml>';
		expect(declareMissingNamespaces(ok)).toBeNull();
	});

	it('does not treat URL schemes in attribute values as prefixes', () => {
		const ok = '<kml xmlns="http://www.opengis.net/kml/2.2"><name>x</name></kml>';
		expect(declareMissingNamespaces(ok)).toBeNull();
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
