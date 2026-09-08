import { describe, expect, it } from 'vitest';
import type { GeoJsonGeometryType } from '../../geometry.js';
import { isGeoJsonGeometryOfTypes } from '../../geometry-check.js';

/**
 * The six shapes, each with coordinates a renderer would accept.
 *
 * Keyed by the type union rather than listed, so a shape added to the union
 * cannot quietly miss a case here.
 */
const SAMPLES: Readonly<Record<GeoJsonGeometryType, unknown>> = {
	Point: { type: 'Point', coordinates: [-121.5, 38.6] },
	MultiPoint: {
		type: 'MultiPoint',
		coordinates: [
			[-121.5, 38.6],
			[-121.4, 38.7],
		],
	},
	LineString: {
		type: 'LineString',
		coordinates: [
			[-121.5, 38.6],
			[-121.4, 38.7],
		],
	},
	MultiLineString: {
		type: 'MultiLineString',
		coordinates: [
			[
				[-121.5, 38.6],
				[-121.4, 38.7],
			],
		],
	},
	Polygon: {
		type: 'Polygon',
		coordinates: [
			[
				[-121.5, 38.6],
				[-121.4, 38.6],
				[-121.4, 38.7],
				[-121.5, 38.6],
			],
		],
	},
	MultiPolygon: {
		type: 'MultiPolygon',
		coordinates: [
			[
				[
					[-121.5, 38.6],
					[-121.4, 38.6],
					[-121.4, 38.7],
					[-121.5, 38.6],
				],
			],
		],
	},
};

const EVERY_SHAPE = Object.keys(SAMPLES) as readonly GeoJsonGeometryType[];

describe('isGeoJsonGeometryOfTypes', () => {
	it.each(EVERY_SHAPE)('accepts a %s when the caller allows it', (type) => {
		expect(isGeoJsonGeometryOfTypes(SAMPLES[type], EVERY_SHAPE)).toBe(true);
	});

	it.each(EVERY_SHAPE)('refuses a %s when the caller does not allow it', (type) => {
		const others = EVERY_SHAPE.filter((candidate) => candidate !== type);

		expect(isGeoJsonGeometryOfTypes(SAMPLES[type], others)).toBe(false);
	});

	/**
	 * The three shapes the eight casts in `apps/web` used to let through. A column
	 * that is null or a string satisfied `as GeoJsonGeometry`, and Mapbox drew
	 * nothing without an error.
	 */
	it('refuses null, undefined and a string', () => {
		expect(isGeoJsonGeometryOfTypes(null, EVERY_SHAPE)).toBe(false);
		expect(isGeoJsonGeometryOfTypes(undefined, EVERY_SHAPE)).toBe(false);
		expect(isGeoJsonGeometryOfTypes('{"type":"Point","coordinates":[0,0]}', EVERY_SHAPE)).toBe(
			false,
		);
	});

	/** The seventh GeoJSON shape, which no record kind may store (ADR 0018). */
	it('refuses a GeometryCollection even with every shape allowed', () => {
		const collection = {
			type: 'GeometryCollection',
			geometries: [SAMPLES.Point],
		};

		expect(isGeoJsonGeometryOfTypes(collection, EVERY_SHAPE)).toBe(false);
	});

	it('refuses an object with no type and one whose type is not a string', () => {
		expect(isGeoJsonGeometryOfTypes({ coordinates: [-121.5, 38.6] }, EVERY_SHAPE)).toBe(false);
		expect(isGeoJsonGeometryOfTypes({ type: 7, coordinates: [-121.5, 38.6] }, EVERY_SHAPE)).toBe(
			false,
		);
	});

	/**
	 * A type the caller allows is not enough. These are the values that pass a cast
	 * and still draw nothing, which is the failure the type cannot state.
	 */
	it('refuses coordinates that are not positions', () => {
		expect(isGeoJsonGeometryOfTypes({ type: 'Point' }, EVERY_SHAPE)).toBe(false);
		expect(isGeoJsonGeometryOfTypes({ type: 'Point', coordinates: [] }, EVERY_SHAPE)).toBe(false);
		expect(
			isGeoJsonGeometryOfTypes({ type: 'Point', coordinates: ['-121.5', '38.6'] }, EVERY_SHAPE),
		).toBe(false);
		expect(
			isGeoJsonGeometryOfTypes({ type: 'Point', coordinates: [Number.NaN, 38.6] }, EVERY_SHAPE),
		).toBe(false);
	});

	it('accepts a position carrying an altitude', () => {
		const withAltitude = { type: 'Point', coordinates: [-121.5, 38.6, 12] };

		expect(isGeoJsonGeometryOfTypes(withAltitude, EVERY_SHAPE)).toBe(true);
	});

	it('refuses a line of one position and a ring of three', () => {
		const line = { type: 'LineString', coordinates: [[-121.5, 38.6]] };
		const ring = {
			type: 'Polygon',
			coordinates: [
				[
					[-121.5, 38.6],
					[-121.4, 38.6],
					[-121.5, 38.6],
				],
			],
		};

		expect(isGeoJsonGeometryOfTypes(line, EVERY_SHAPE)).toBe(false);
		expect(isGeoJsonGeometryOfTypes(ring, EVERY_SHAPE)).toBe(false);
	});

	it('refuses a multi shape with no parts', () => {
		expect(isGeoJsonGeometryOfTypes({ type: 'MultiPolygon', coordinates: [] }, EVERY_SHAPE)).toBe(
			false,
		);
	});
});
