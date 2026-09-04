/** @vitest-environment jsdom */
/**
 * The KML half of the import parser, which needs a DOM.
 *
 * Split out from `geometry-import.test.ts` so the GeoJSON cases keep running on
 * bare Node: `parseKmlGroups` is the only thing in the module that touches
 * `DOMParser`, and jsdom costs a second of startup per file that asks for it.
 *
 * KML has no name for a multi shape. Several pieces arrive as several geometry
 * tags inside a `<MultiGeometry>`, so the cases that matter here are the ones
 * where the tag count and the shape count disagree.
 */
import { describe, expect, it } from 'vitest';
import { collectImportGroups, type ImportGeometryKind } from '../../geometry-import.js';

const POINT_KINDS: readonly ImportGeometryKind[] = ['Point', 'MultiPoint'];
const ONE_POINT_KIND: readonly ImportGeometryKind[] = ['Point'];
const AREA_KINDS: readonly ImportGeometryKind[] = ['Polygon', 'MultiPolygon'];

const SQUARE = '0,0 0,1 1,1 1,0 0,0';

function kml(body: string): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>${body}</Document></kml>`;
}

function placemark(name: string, geometry: string): string {
	return `<Placemark><name>${name}</name>${geometry}</Placemark>`;
}

function point(coordinates: string): string {
	return `<Point><coordinates>${coordinates}</coordinates></Point>`;
}

const polygon = `<Polygon><outerBoundaryIs><LinearRing><coordinates>${SQUARE}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;

function parse(body: string, kinds: readonly ImportGeometryKind[] = POINT_KINDS) {
	return collectImportGroups(kml(body), 'sites.kml', kinds);
}

describe('KML points', () => {
	it('reads a Point placemark', () => {
		const { groups, error } = parse(placemark('Trap 12', point('-121.5,38.6,0')));

		expect(error).toBeUndefined();
		expect(groups[0]?.name).toBe('Trap 12');
		expect(groups[0]?.geometry).toEqual({ type: 'Point', coordinates: [-121.5, 38.6] });
	});

	it('reads a MultiGeometry of points as one multipoint', () => {
		const { groups } = parse(
			placemark(
				'Basins',
				`<MultiGeometry>${point('-121.5,38.6')}${point('-121.6,38.7')}</MultiGeometry>`,
			),
		);

		expect(groups[0]?.geometry).toEqual({
			type: 'MultiPoint',
			coordinates: [
				[-121.5, 38.6],
				[-121.6, 38.7],
			],
		});
	});

	it('refuses a MultiGeometry of points by name on a record that stores one', () => {
		const { groups } = parse(
			placemark(
				'Basins',
				`<MultiGeometry>${point('-121.5,38.6')}${point('-121.6,38.7')}</MultiGeometry>`,
			),
			ONE_POINT_KIND,
		);

		expect(groups[0]?.geometry).toBeNull();
		expect(groups[0]?.refusal).toBe('multipart');
	});

	it('reads a point that sits outside any placemark', () => {
		const { groups } = parse(point('-121.5,38.6'));

		expect(groups[0]?.name).toBeNull();
		expect(groups[0]?.geometry?.type).toBe('Point');
	});

	it('refuses a placemark that holds a label point beside an area', () => {
		const { groups } = parse(
			placemark('Park A', `<MultiGeometry>${point('0.5,0.5')}${polygon}</MultiGeometry>`),
			AREA_KINDS,
		);

		expect(groups[0]?.geometry).toBeNull();
		expect(groups[0]?.refusal).toBe('mixed');
	});

	it('leaves a point generic on a record that stores areas', () => {
		const { groups } = parse(placemark('Trap 12', point('-121.5,38.6')), AREA_KINDS);

		expect(groups[0]?.refusal).toBe('unsupported');
	});

	it('refuses a Point element with no usable position', () => {
		const { groups } = parse(placemark('Nowhere', '<Point><coordinates>  </coordinates></Point>'));

		expect(groups[0]?.geometry).toBeNull();
		expect(groups[0]?.refusal).toBe('unsupported');
	});
});

describe('KML areas and lines', () => {
	it('still reads a polygon placemark', () => {
		const { groups } = parse(placemark('North', polygon), AREA_KINDS);

		expect(groups[0]?.name).toBe('North');
		expect(groups[0]?.geometry?.type).toBe('Polygon');
	});

	it('still reads a line placemark', () => {
		const { groups } = parse(
			placemark('Levee walk', '<LineString><coordinates>0,0 1,1 2,0</coordinates></LineString>'),
			['LineString', 'MultiLineString'],
		);

		expect(groups[0]?.geometry).toEqual({
			type: 'LineString',
			coordinates: [
				[0, 0],
				[1, 1],
				[2, 0],
			],
		});
	});
});
