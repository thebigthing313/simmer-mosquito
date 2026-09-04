import { describe, expect, it } from 'vitest';
import {
	collectImportGroups,
	type ImportGeometryKind,
	type ImportPosition,
	importBaseGeometryKind,
	importCandidatesFrom,
	importPartCount,
	importVertexCount,
	isImportGeometryKind,
	isWgs84Geometry,
	parseGeoJsonGroups,
} from '../../geometry-import.js';

// Spelled out here as test input, the way a caller's `kinds` argument arrives
// after it has been filtered out of the geometry register.
const AREA_KINDS: readonly ImportGeometryKind[] = ['Polygon', 'MultiPolygon'];
const ONE_AREA_KIND: readonly ImportGeometryKind[] = ['Polygon'];
const LINE_KINDS: readonly ImportGeometryKind[] = ['LineString', 'MultiLineString'];
const POINT_KINDS: readonly ImportGeometryKind[] = ['Point', 'MultiPoint'];
const ONE_POINT_KIND: readonly ImportGeometryKind[] = ['Point'];

const square: ImportPosition[] = [
	[0, 0],
	[0, 1],
	[1, 1],
	[1, 0],
	[0, 0],
];
const square2: ImportPosition[] = [
	[2, 2],
	[2, 3],
	[3, 3],
	[3, 2],
	[2, 2],
];
const line: ImportPosition[] = [
	[0, 0],
	[1, 1],
	[2, 0],
];

function feature(name: string, geometry: unknown) {
	return { type: 'Feature', properties: { name }, geometry };
}

function parse(geometry: unknown, kinds: readonly ImportGeometryKind[] = AREA_KINDS) {
	return parseGeoJsonGroups(JSON.stringify(geometry), kinds);
}

describe('one row per feature', () => {
	it('keeps a multipart feature whole', () => {
		const groups = parse(
			feature('Park A', { type: 'MultiPolygon', coordinates: [[square], [square2]] }),
		);

		expect(groups).toHaveLength(1);
		expect(groups[0]?.name).toBe('Park A');
		expect(groups[0]?.geometry?.type).toBe('MultiPolygon');
		expect(groups[0]?.refusal).toBeNull();
	});

	it('demotes a one-piece multipart feature to the plain shape', () => {
		const groups = parse(feature('One lot', { type: 'MultiPolygon', coordinates: [[square]] }));

		expect(groups[0]?.geometry).toEqual({ type: 'Polygon', coordinates: [square] });
	});

	it('reads a multi line feature as one line shape', () => {
		const groups = parse({ type: 'MultiLineString', coordinates: [line, line] }, LINE_KINDS);

		expect(groups[0]?.geometry?.type).toBe('MultiLineString');
		expect(importPartCount(groups[0]?.geometry as never)).toBe(2);
	});

	it('gives every feature in a collection its own row', () => {
		const groups = parse({
			type: 'FeatureCollection',
			features: [
				feature('North', { type: 'Polygon', coordinates: [square] }),
				feature('Park A', { type: 'MultiPolygon', coordinates: [[square], [square2]] }),
			],
		});

		expect(groups.map((group) => group.name)).toEqual(['North', 'Park A']);
	});

	it('closes polygon rings the file left open', () => {
		const open = square.slice(0, -1);
		const groups = parse({ type: 'Polygon', coordinates: [open] });

		expect(groups[0]?.geometry).toEqual({ type: 'Polygon', coordinates: [square] });
	});

	it('keeps a ring that encloses nothing, which is the write path’s refusal to make', () => {
		const groups = parse({ type: 'Polygon', coordinates: [[square[0], square[0]]] });

		expect(groups[0]?.geometry?.type).toBe('Polygon');
	});

	it('reads a point feature', () => {
		const groups = parse(feature('Trap 12', { type: 'Point', coordinates: [5, 6] }), POINT_KINDS);

		expect(groups[0]?.name).toBe('Trap 12');
		expect(groups[0]?.geometry).toEqual({ type: 'Point', coordinates: [5, 6] });
	});

	it('reads a multipoint feature as one shape per position', () => {
		const groups = parse(
			{
				type: 'MultiPoint',
				coordinates: [
					[5, 6],
					[7, 8],
				],
			},
			POINT_KINDS,
		);

		expect(groups[0]?.geometry?.type).toBe('MultiPoint');
		expect(importPartCount(groups[0]?.geometry as never)).toBe(2);
	});

	it('demotes a one-position multipoint to a plain point', () => {
		const groups = parse({ type: 'MultiPoint', coordinates: [[5, 6]] }, POINT_KINDS);

		expect(groups[0]?.geometry).toEqual({ type: 'Point', coordinates: [5, 6] });
	});

	it('refuses a point whose position is malformed', () => {
		const groups = parse(feature('Bad', { type: 'Point', coordinates: ['5', 6] }), POINT_KINDS);

		expect(groups[0]?.geometry).toBeNull();
		expect(groups[0]?.refusal).toBe('unsupported');
	});

	it('refuses a line of one position', () => {
		const groups = parse({ type: 'LineString', coordinates: [line[0]] }, LINE_KINDS);

		expect(groups[0]?.geometry).toBeNull();
		expect(groups[0]?.refusal).toBe('unsupported');
	});
});

describe('refusals', () => {
	it('names a multipart feature the caller cannot store', () => {
		const groups = parse(
			feature('Park A', { type: 'MultiPolygon', coordinates: [[square], [square2]] }),
			ONE_AREA_KIND,
		);

		expect(groups[0]?.geometry).toBeNull();
		expect(groups[0]?.refusal).toBe('multipart');
	});

	it('leaves a feature of an unwanted kind generic', () => {
		const groups = parse(
			feature('Park A', { type: 'MultiPolygon', coordinates: [[square], [square2]] }),
			LINE_KINDS,
		);

		expect(groups[0]?.refusal).toBe('unsupported');
	});

	it('leaves a point generic on a caller that stores areas', () => {
		const groups = parse(feature('A point', { type: 'Point', coordinates: [5, 5] }));

		expect(groups[0]?.refusal).toBe('unsupported');
	});

	it('names a multipoint the caller cannot store', () => {
		const groups = parse(
			feature('Basins', {
				type: 'MultiPoint',
				coordinates: [
					[5, 6],
					[7, 8],
				],
			}),
			ONE_POINT_KIND,
		);

		expect(groups[0]?.refusal).toBe('multipart');
	});

	it('refuses a geometry collection by name rather than dissolving it', () => {
		const groups = parse(
			feature('Mixed', {
				type: 'GeometryCollection',
				geometries: [
					{ type: 'Polygon', coordinates: [square] },
					{ type: 'LineString', coordinates: line },
				],
			}),
		);

		expect(groups[0]?.geometry).toBeNull();
		expect(groups[0]?.refusal).toBe('mixed');
	});
});

describe('collectImportGroups', () => {
	it('reads a feature collection and flags features of an unwanted kind', () => {
		const text = JSON.stringify({
			type: 'FeatureCollection',
			features: [
				feature('Levee walk', { type: 'MultiLineString', coordinates: [line, line] }),
				feature('North basin', { type: 'Polygon', coordinates: [square] }),
			],
		});

		const { groups, error } = collectImportGroups(text, 'routes.geojson', LINE_KINDS);

		expect(error).toBeUndefined();
		expect(groups).toHaveLength(2);
		expect(groups[0]?.name).toBe('Levee walk');
		expect(importPartCount(groups[0]?.geometry as never)).toBe(2);
		expect(groups[1]?.refusal).toBe('unsupported');
	});

	it('reports malformed input instead of throwing', () => {
		const { groups, error } = collectImportGroups('{ not json', 'broken.geojson', AREA_KINDS);
		expect(error).toBeDefined();
		expect(groups).toEqual([]);
	});
});

describe('importCandidatesFrom', () => {
	const polygon = { type: 'Polygon' as const, coordinates: [square] };

	it('offers one candidate per feature and counts each refusal apart', () => {
		const result = importCandidatesFrom(
			[
				{ name: 'Park A', geometry: polygon, refusal: null, note: null },
				{ name: 'Labelled', geometry: polygon, refusal: null, note: 'labelPoint' },
				{ name: null, geometry: polygon, refusal: null, note: null },
				{ name: 'A point', geometry: null, refusal: 'unsupported', note: null },
				{ name: 'Split', geometry: null, refusal: 'multipart', note: null },
				{ name: 'Mixed', geometry: null, refusal: 'mixed', note: null },
			],
			{ limit: 10, fallbackName: 'Shape' },
		);

		expect(result.candidates.map((candidate) => candidate.name)).toEqual([
			'Park A',
			'Labelled',
			'Shape 3',
		]);
		expect(result.candidates.map((candidate) => candidate.note)).toEqual([
			null,
			'labelPoint',
			null,
		]);
		expect(result.skipped).toBe(1);
		expect(result.multipart).toBe(1);
		expect(result.mixed).toBe(1);
		expect(result.truncated).toBe(false);
	});

	it('caps at the limit and flags truncation', () => {
		const groups = Array.from({ length: 5 }, () => ({
			name: null,
			geometry: polygon,
			refusal: null,
			note: null,
		}));

		const result = importCandidatesFrom(groups, { limit: 3, fallbackName: 'Shape' });

		expect(result.candidates).toHaveLength(3);
		expect(result.truncated).toBe(true);
	});
});

describe('isWgs84Geometry', () => {
	it('rejects projected coordinates and accepts lng/lat', () => {
		expect(isWgs84Geometry({ type: 'Polygon', coordinates: [square] })).toBe(true);
		expect(
			isWgs84Geometry({
				type: 'LineString',
				coordinates: [
					[6_500_000, 1_800_000],
					[6_500_100, 1_800_100],
				],
			}),
		).toBe(false);
	});

	it('reads a point the same way it reads a ring', () => {
		expect(isWgs84Geometry({ type: 'Point', coordinates: [-121.5, 38.6] })).toBe(true);
		expect(isWgs84Geometry({ type: 'Point', coordinates: [6_012_345, 1_876_543] })).toBe(false);
		expect(
			isWgs84Geometry({
				type: 'MultiPoint',
				coordinates: [
					[-121.5, 38.6],
					[6_012_345, 1_876_543],
				],
			}),
		).toBe(false);
	});

	it('reads every piece of a multipart shape', () => {
		const projected: ImportPosition[] = [
			[6_012_345, 1_876_543],
			[6_012_345, 1_876_643],
			[6_012_445, 1_876_643],
			[6_012_345, 1_876_543],
		];

		expect(isWgs84Geometry({ type: 'MultiPolygon', coordinates: [[square], [square2]] })).toBe(
			true,
		);
		expect(isWgs84Geometry({ type: 'MultiPolygon', coordinates: [[square], [projected]] })).toBe(
			false,
		);
	});
});

describe('importVertexCount', () => {
	it('counts a polygon ring without its closing position', () => {
		expect(importVertexCount({ type: 'Polygon', coordinates: [square] })).toBe(4);
		expect(importVertexCount({ type: 'LineString', coordinates: line })).toBe(3);
	});

	it('adds up every piece of a multipart shape', () => {
		expect(importVertexCount({ type: 'MultiPolygon', coordinates: [[square], [square2]] })).toBe(8);
		expect(importVertexCount({ type: 'MultiLineString', coordinates: [line, line] })).toBe(6);
	});

	it('leaves holes out, the way the draw control does', () => {
		expect(importVertexCount({ type: 'Polygon', coordinates: [square, square2] })).toBe(4);
	});

	it('counts a point as one and a multipoint as its positions', () => {
		expect(importVertexCount({ type: 'Point', coordinates: [5, 6] })).toBe(1);
		expect(
			importVertexCount({
				type: 'MultiPoint',
				coordinates: [
					[5, 6],
					[7, 8],
				],
			}),
		).toBe(2);
	});
});

describe('importPartCount', () => {
	it('reads one for a plain shape and the piece count for a multi one', () => {
		expect(importPartCount({ type: 'Polygon', coordinates: [square] })).toBe(1);
		expect(importPartCount({ type: 'MultiPolygon', coordinates: [[square], [square2]] })).toBe(2);
		expect(importPartCount({ type: 'Point', coordinates: [5, 6] })).toBe(1);
		expect(
			importPartCount({
				type: 'MultiPoint',
				coordinates: [
					[5, 6],
					[7, 8],
				],
			}),
		).toBe(2);
	});
});

describe('isImportGeometryKind', () => {
	it('names every shape the register can ask for', () => {
		expect(isImportGeometryKind('Point')).toBe(true);
		expect(isImportGeometryKind('MultiPoint')).toBe(true);
		expect(isImportGeometryKind('Polygon')).toBe(true);
		expect(isImportGeometryKind('MultiPolygon')).toBe(true);
		expect(isImportGeometryKind('MultiLineString')).toBe(true);
	});

	it('rejects a name that is not a shape at all', () => {
		expect(isImportGeometryKind('GeometryCollection')).toBe(false);
		expect(isImportGeometryKind('toString')).toBe(false);
	});
});

describe('importBaseGeometryKind', () => {
	it('reads the single-piece kind behind a multi one', () => {
		expect(importBaseGeometryKind('MultiPolygon')).toBe('Polygon');
		expect(importBaseGeometryKind('LineString')).toBe('LineString');
		expect(importBaseGeometryKind('MultiPoint')).toBe('Point');
	});
});
