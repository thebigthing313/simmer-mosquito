import type { GeoJsonFeatureCollection, GeoJsonPolygon } from '@simmer-mosquito/mapping';
import { describe, expect, it } from 'vitest';
import {
	checkOwnedGeometry,
	toMapboxGeoJson,
	toMapboxGeometry,
} from '../../../../components/map/geojson-adapter';

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

/**
 * The render seam's check. What matters here is not that a good shape passes but
 * what the two failures do: nothing throws, the map draws nothing, and the record
 * gets a sentence naming the field and the shape that was found.
 */
describe('checkOwnedGeometry', () => {
	const point = { type: 'Point', coordinates: [-121.5, 38.6] } as const;
	const polygon = {
		type: 'Polygon',
		coordinates: [
			[
				[-121.5, 38.6],
				[-121.4, 38.6],
				[-121.4, 38.7],
				[-121.5, 38.6],
			],
		],
	} as const;

	it('hands back the same object, because a copy would re-add the source', () => {
		const checked = checkOwnedGeometry('address', point);

		expect(checked.geometry).toBe(point);
		expect(checked.unsupportedShape).toBeNull();
	});

	it('reads what a kind may store off the register', () => {
		// Both facts come from OWNED_GEOMETRY_POLICIES: a Habitat stores all six
		// shapes and an Address stores a Point and nothing else.
		expect(checkOwnedGeometry('habitat', polygon).geometry).toBe(polygon);
		expect(checkOwnedGeometry('address', polygon).geometry).toBeNull();
	});

	it('refuses a shape the kind may not store, and says which', () => {
		const checked = checkOwnedGeometry('address', polygon);

		expect(checked.geometry).toBeNull();
		expect(checked.unsupportedShape).toBe(
			'Address Geometry is stored as Polygon, which the map cannot draw. It takes Point.',
		);
	});

	it('refuses a GeometryCollection, which no kind stores', () => {
		const checked = checkOwnedGeometry('habitat', {
			type: 'GeometryCollection',
			geometries: [point],
		});

		expect(checked.geometry).toBeNull();
		expect(checked.unsupportedShape).toContain('stored as Geometry collection');
	});

	it('refuses a string without claiming it was a shape', () => {
		const checked = checkOwnedGeometry('region', '{"type":"Polygon"}');

		expect(checked.geometry).toBeNull();
		expect(checked.unsupportedShape).toBe(
			'Region Geometry is not stored as a shape the map can draw. It takes Polygon, Multi-polygon.',
		);
	});

	/**
	 * A record with no geometry is the common case, not a problem: the Location
	 * card's empty state already says so, and reporting here would put a refusal
	 * on every record that has never been drawn.
	 */
	it('reports nothing when the record stores no geometry', () => {
		for (const nothing of [null, undefined]) {
			const checked = checkOwnedGeometry('habitat', nothing);

			expect(checked.geometry).toBeNull();
			expect(checked.unsupportedShape).toBeNull();
		}
	});

	it('throws on nothing it is handed', () => {
		for (const value of [null, 7, 'x', {}, { type: 'Point' }, [], polygon]) {
			expect(() => checkOwnedGeometry('address', value)).not.toThrow();
		}
	});
});
