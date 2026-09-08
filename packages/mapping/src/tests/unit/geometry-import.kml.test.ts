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
const LINE_KINDS: readonly ImportGeometryKind[] = ['LineString', 'MultiLineString'];
const AREA_AND_LINE_KINDS: readonly ImportGeometryKind[] = [
	'Polygon',
	'MultiPolygon',
	'LineString',
	'MultiLineString',
];

const SQUARE = '0,0 0,1 1,1 1,0 0,0';
const SECOND_SQUARE = '2,2 2,3 3,3 3,2 2,2';

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

function area(ring: string): string {
	return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${ring}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
}

const polygon = area(SQUARE);
const line = '<LineString><coordinates>0,0 1,1 2,0</coordinates></LineString>';

/**
 * A Placemark as Google Earth writes one: the shape it drew, and a `<Point>`
 * beside it holding where the label sits. `tessellate`, `altitudeMode` and the
 * style reference are all there because a real file has them and the parser has
 * to walk past them to reach the geometry.
 */
const GOOGLE_EARTH_PLACEMARK = `<Placemark>
	<name>Cannery Park</name>
	<styleUrl>#m_ylw-pushpin</styleUrl>
	<MultiGeometry>
		<Point>
			<altitudeMode>clampToGround</altitudeMode>
			<coordinates>0.5,0.5,0</coordinates>
		</Point>
		<Polygon>
			<tessellate>1</tessellate>
			<altitudeMode>clampToGround</altitudeMode>
			<outerBoundaryIs>
				<LinearRing>
					<coordinates>${SQUARE}</coordinates>
				</LinearRing>
			</outerBoundaryIs>
		</Polygon>
	</MultiGeometry>
</Placemark>`;

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

describe('KML label points', () => {
	it('offers the polygon of a Google Earth placemark and drops its label point', () => {
		const { groups } = parse(GOOGLE_EARTH_PLACEMARK, AREA_KINDS);

		expect(groups[0]?.name).toBe('Cannery Park');
		expect(groups[0]?.refusal).toBeNull();
		expect(groups[0]?.geometry?.type).toBe('Polygon');
		expect(groups[0]?.note).toBe('labelPoint');
	});

	it('offers the line of a placemark that labels it with a point', () => {
		const { groups } = parse(
			placemark('Levee walk', `<MultiGeometry>${point('1,0.5')}${line}</MultiGeometry>`),
			LINE_KINDS,
		);

		expect(groups[0]?.geometry?.type).toBe('LineString');
		expect(groups[0]?.note).toBe('labelPoint');
	});

	it('keeps every piece of a multipart shape the label point sits beside', () => {
		const { groups } = parse(
			placemark(
				'Park A',
				`<MultiGeometry>${point('0.5,0.5')}${area(SQUARE)}${area(SECOND_SQUARE)}</MultiGeometry>`,
			),
			AREA_KINDS,
		);

		expect(groups[0]?.geometry?.type).toBe('MultiPolygon');
		expect(groups[0]?.note).toBe('labelPoint');
	});

	it('refuses a placemark holding several points beside a shape', () => {
		const { groups } = parse(
			placemark(
				'Park A',
				`<MultiGeometry>${point('0.4,0.4')}${point('0.6,0.6')}${polygon}</MultiGeometry>`,
			),
			AREA_KINDS,
		);

		expect(groups[0]?.geometry).toBeNull();
		expect(groups[0]?.refusal).toBe('mixed');
	});

	it('refuses a placemark mixing an area with a line', () => {
		const { groups } = parse(
			placemark('Park A', `<MultiGeometry>${polygon}${line}</MultiGeometry>`),
			AREA_AND_LINE_KINDS,
		);

		expect(groups[0]?.geometry).toBeNull();
		expect(groups[0]?.refusal).toBe('mixed');
	});

	it('refuses a label point beside an area mixed with a line', () => {
		const { groups } = parse(
			placemark('Park A', `<MultiGeometry>${point('0.5,0.5')}${polygon}${line}</MultiGeometry>`),
			AREA_AND_LINE_KINDS,
		);

		expect(groups[0]?.geometry).toBeNull();
		expect(groups[0]?.refusal).toBe('mixed');
		expect(groups[0]?.note).toBeNull();
	});

	it('says nothing about a label point on a placemark that had none', () => {
		const { groups } = parse(placemark('North', polygon), AREA_KINDS);

		expect(groups[0]?.note).toBeNull();
	});

	it('drops the label point before the kinds gate is applied', () => {
		const { groups } = parse(GOOGLE_EARTH_PLACEMARK, ['Polygon']);

		expect(groups[0]?.geometry?.type).toBe('Polygon');
		expect(groups[0]?.note).toBe('labelPoint');
	});
});

describe('KML areas and lines', () => {
	it('still reads a polygon placemark', () => {
		const { groups } = parse(placemark('North', polygon), AREA_KINDS);

		expect(groups[0]?.name).toBe('North');
		expect(groups[0]?.geometry?.type).toBe('Polygon');
	});

	it('still reads a line placemark', () => {
		const { groups } = parse(placemark('Levee walk', line), LINE_KINDS);

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
