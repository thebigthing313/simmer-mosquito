import { describe, expect, it } from 'vitest';
import {
	boundsFromGeoJson,
	centroidFromGeoJson,
	containsLngLat,
	countGeoJsonVertices,
	formatBoundingBox,
	parseBoundingBox,
} from './geometry.js';

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
