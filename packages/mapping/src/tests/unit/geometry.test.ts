import { describe, expect, it } from 'vitest';
import {
	boundsFromGeoJson,
	centroidFromGeoJson,
	containsLngLat,
	countGeoJsonVertices,
	formatBoundingBox,
	geometryContainsLngLat,
	ownedCentroidFromGeoJson,
	parseBoundingBox,
} from '../../geometry.js';

describe('geometry helpers', () => {
	it('parses and formats canonical bounding boxes', () => {
		const bbox = parseBoundingBox('-75.25,40.1,-74.75,40.5');

		expect(bbox).toEqual({
			west: -75.25,
			south: 40.1,
			east: -74.75,
			north: 40.5,
		});
		expect(bbox ? formatBoundingBox(bbox) : null).toBe('-75.25,40.1,-74.75,40.5');
		expect(formatBoundingBox({ west: 0, south: 0, east: 10, north: 10 })).toBe('0,0,10,10');
		expect(parseBoundingBox('-75,40,-76,41')).toBeNull();
	});

	it('checks whether a point falls inside bounds', () => {
		const bbox = { west: -75, south: 40, east: -74, north: 41 };

		expect(containsLngLat(bbox, { lng: -74.5, lat: 40.5 })).toBe(true);
		expect(containsLngLat(bbox, { lng: -73.5, lat: 40.5 })).toBe(false);
	});

	it('checks whether a point falls inside a region boundary', () => {
		const square = {
			type: 'Polygon',
			coordinates: [
				[
					[-75, 40],
					[-74, 40],
					[-74, 41],
					[-75, 41],
					[-75, 40],
				],
			],
		} as const;

		expect(geometryContainsLngLat(square, { lng: -74.5, lat: 40.5 })).toBe(true);
		expect(geometryContainsLngLat(square, { lng: -73.5, lat: 40.5 })).toBe(false);
		// A record sitting on the district line belongs to the district.
		expect(geometryContainsLngLat(square, { lng: -75, lat: 40.5 })).toBe(true);
		expect(geometryContainsLngLat(square, { lng: -74, lat: 41 })).toBe(true);
	});

	it('excludes points inside a hole, and reads every part of a multipolygon', () => {
		const withHole = {
			type: 'Polygon',
			coordinates: [
				[
					[0, 0],
					[10, 0],
					[10, 10],
					[0, 10],
					[0, 0],
				],
				[
					[4, 4],
					[6, 4],
					[6, 6],
					[4, 6],
					[4, 4],
				],
			],
		} as const;

		expect(geometryContainsLngLat(withHole, { lng: 1, lat: 1 })).toBe(true);
		expect(geometryContainsLngLat(withHole, { lng: 5, lat: 5 })).toBe(false);

		const twoParts = {
			type: 'MultiPolygon',
			coordinates: [
				withHole.coordinates,
				[
					[
						[20, 20],
						[21, 20],
						[21, 21],
						[20, 21],
						[20, 20],
					],
				],
			],
		} as const;

		expect(geometryContainsLngLat(twoParts, { lng: 20.5, lat: 20.5 })).toBe(true);
		expect(geometryContainsLngLat(twoParts, { lng: 15, lat: 15 })).toBe(false);
	});

	it('reports no containment for geometries that enclose nothing', () => {
		const line = {
			type: 'LineString',
			coordinates: [
				[0, 0],
				[10, 10],
			],
		} as const;

		expect(geometryContainsLngLat(line, { lng: 5, lat: 5 })).toBe(false);
	});

	it('calculates simple bounds and centroid fallbacks for GeoJSON', () => {
		const geometry = {
			type: 'LineString',
			coordinates: [
				[-75, 40],
				[-74, 42],
			],
		} as const;

		expect(boundsFromGeoJson(geometry)).toEqual({
			west: -75,
			south: 40,
			east: -74,
			north: 42,
		});
		expect(centroidFromGeoJson(geometry)).toEqual({ lng: -74.5, lat: 41 });
	});

	it('derives owned centroid columns with the PostGIS st_* geom type form', () => {
		// geomType must match the database set_owned_centroid() trigger, which
		// stores lower(st_geometrytype(geom)), e.g. st_point / st_polygon.
		expect(ownedCentroidFromGeoJson({ type: 'Point', coordinates: [-122.3321, 47.6062] })).toEqual({
			lng: -122.3321,
			lat: 47.6062,
			geomType: 'st_point',
		});
		expect(
			ownedCentroidFromGeoJson({
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[0, 2],
						[2, 2],
						[2, 0],
						[0, 0],
					],
				],
			})?.geomType,
		).toBe('st_polygon');
		expect(ownedCentroidFromGeoJson({ type: 'Polygon', coordinates: [] })).toBeNull();
	});

	it('weights an areal centroid by area rather than by vertex count', () => {
		// A square with a redundant vertex along one edge. The area centroid is the
		// middle of the square; a vertex average is dragged toward the crowded
		// edge. `st_centroid` answers the first, so this is the one the optimistic
		// row has to give.
		const crowdedEdge = {
			type: 'Polygon',
			coordinates: [
				[
					[0, 0],
					[1, 0],
					[2, 0],
					[2, 2],
					[0, 2],
					[0, 0],
				],
			],
		} as const;

		expect(ownedCentroidFromGeoJson(crowdedEdge)).toEqual({
			lng: 1,
			lat: 1,
			geomType: 'st_polygon',
		});
		expect(centroidFromGeoJson(crowdedEdge)?.lat).toBeLessThan(1);
	});

	it('subtracts a hole from the areal centroid', () => {
		// Outer square of area 16 centred on (2, 2), hole of area 1 centred on
		// (3, 3). (2 * 16 - 3 * 1) / 15.
		const withHole = {
			type: 'Polygon',
			coordinates: [
				[
					[0, 0],
					[4, 0],
					[4, 4],
					[0, 4],
					[0, 0],
				],
				[
					[2.5, 2.5],
					[2.5, 3.5],
					[3.5, 3.5],
					[3.5, 2.5],
					[2.5, 2.5],
				],
			],
		} as const;
		const centroid = ownedCentroidFromGeoJson(withHole);

		expect(centroid?.lng).toBeCloseTo(29 / 15, 10);
		expect(centroid?.lat).toBeCloseTo(29 / 15, 10);
	});

	it('weights multipolygon parts by their own area', () => {
		// A big part and a small distant one. Averaging vertices would put the
		// marker halfway between them, because both parts carry four of them.
		const parts = {
			type: 'MultiPolygon',
			coordinates: [
				[
					[
						[0, 0],
						[2, 0],
						[2, 2],
						[0, 2],
						[0, 0],
					],
				],
				[
					[
						[10, 10],
						[11, 10],
						[11, 11],
						[10, 11],
						[10, 10],
					],
				],
			],
		} as const;
		const centroid = ownedCentroidFromGeoJson(parts);

		expect(centroid?.lng).toBeCloseTo(2.9, 10);
		expect(centroid?.lat).toBeCloseTo(2.9, 10);
		expect(centroid?.geomType).toBe('st_multipolygon');
	});

	it('keeps the vertex average for points and lines', () => {
		// The documented drift. `st_centroid` weights a line by length, and this
		// keeps averaging vertices, which is what the marker has always shown.
		expect(
			ownedCentroidFromGeoJson({
				type: 'MultiPoint',
				coordinates: [
					[0, 0],
					[2, 4],
				],
			}),
		).toEqual({ lng: 1, lat: 2, geomType: 'st_multipoint' });
	});

	it('counts GeoJSON vertices across nested geometry types', () => {
		expect(
			countGeoJsonVertices({
				type: 'Polygon',
				coordinates: [
					[
						[-75, 40],
						[-74, 40],
						[-74, 41],
						[-75, 40],
					],
				],
			}),
		).toBe(3);
		expect(
			countGeoJsonVertices({
				type: 'MultiPolygon',
				coordinates: [
					[
						[
							[-75, 40],
							[-74, 40],
							[-74, 41],
							[-75, 40],
						],
					],
					[
						[
							[-76, 41],
							[-75, 41],
							[-75, 42],
							[-76, 41],
						],
					],
				],
			}),
		).toBe(6);
	});
});
