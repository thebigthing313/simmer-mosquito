import type { GeoJsonFeatureCollection, GeoJsonPolygon } from '@simmer-mosquito/mapping';
import { describe, expect, it } from 'vitest';
import { toMapboxGeoJson, toMapboxGeometry } from '../../../../components/map/geojson-adapter';

/**
 * The adapter reinterprets rather than copies, and that is the property worth
 * asserting: `useGeoJsonSource` holds `data` in an effect dependency and pushes
 * it through `setData`, so an adapter that returned a new object would re-add
 * the source on every render and repaint the map every frame.
 */
describe('toMapboxGeoJson', () => {
	it('hands back the same object', () => {
		const collection: GeoJsonFeatureCollection = {
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					geometry: { type: 'Point', coordinates: [-121.5, 38.6] },
					properties: { role: 'center' },
				},
			],
		};

		expect(toMapboxGeoJson(collection)).toBe(collection);
	});

	it('passes a Mapbox-shaped value through unchanged', () => {
		const collection: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

		expect(toMapboxGeoJson(collection)).toBe(collection);
	});

	it('carries null through, because null is what unmounts a layer', () => {
		expect(toMapboxGeoJson(null)).toBeNull();
	});
});

describe('toMapboxGeometry', () => {
	it('hands back the same object', () => {
		// A ring rather than a point: ADR 0018 puts all six OGC shapes on this
		// seam, and the readonly nesting a plain `as` chokes on starts here.
		const polygon: GeoJsonPolygon = {
			type: 'Polygon',
			coordinates: [
				[
					[-121.5, 38.6],
					[-121.4, 38.6],
					[-121.4, 38.7],
					[-121.5, 38.6],
				],
			],
		};

		expect(toMapboxGeometry(polygon)).toBe(polygon);
	});
});
