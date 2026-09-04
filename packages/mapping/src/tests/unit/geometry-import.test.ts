import { describe, expect, it } from 'vitest';
import {
	collectImportGroups,
	flattenGeometries,
	type ImportGeometryKind,
	type ImportPosition,
	importCandidatesFrom,
	importVertexCount,
	isImportGeometryKind,
	isWgs84Geometry,
} from '../../geometry-import.js';

// Spelled out here as test input, the way a caller's `kinds` argument arrives.
const POLYGON_KINDS: readonly ImportGeometryKind[] = ['Polygon'];
const LINE_KINDS: readonly ImportGeometryKind[] = ['LineString'];

const square: ImportPosition[] = [
	[0, 0],
	[0, 1],
	[1, 1],
	[1, 0],
	[0, 0],
];
const line: ImportPosition[] = [
	[0, 0],
	[1, 1],
	[2, 0],
];

describe('flattenGeometries', () => {
	it('keeps only the requested kinds', () => {
		const collection = {
			type: 'GeometryCollection',
			geometries: [
				{ type: 'Polygon', coordinates: [square] },
				{ type: 'LineString', coordinates: line },
				{ type: 'Point', coordinates: [5, 5] },
			],
		};

		expect(flattenGeometries(collection, POLYGON_KINDS).map((g) => g.type)).toEqual(['Polygon']);
		expect(flattenGeometries(collection, LINE_KINDS).map((g) => g.type)).toEqual(['LineString']);
		expect(flattenGeometries(collection, ['Polygon', 'LineString'])).toHaveLength(2);
	});

	it('splits multi-part geometries into single-part ones', () => {
		expect(
			flattenGeometries({ type: 'MultiPolygon', coordinates: [[square], [square]] }, POLYGON_KINDS),
		).toHaveLength(2);
		expect(
			flattenGeometries({ type: 'MultiLineString', coordinates: [line, line] }, LINE_KINDS),
		).toHaveLength(2);
	});

	it('closes polygon rings the file left open', () => {
		const open = square.slice(0, -1);
		const [polygon] = flattenGeometries({ type: 'Polygon', coordinates: [open] }, POLYGON_KINDS);
		expect(polygon?.coordinates[0]).toEqual(square);
	});

	it('rejects shapes with too few positions', () => {
		expect(
			flattenGeometries({ type: 'Polygon', coordinates: [[square[0], square[1]]] }, POLYGON_KINDS),
		).toEqual([]);
		expect(flattenGeometries({ type: 'LineString', coordinates: [line[0]] }, LINE_KINDS)).toEqual(
			[],
		);
	});
});

describe('collectImportGroups', () => {
	it('groups a feature collection and flags features of an unwanted kind', () => {
		const text = JSON.stringify({
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					properties: { name: 'Levee walk' },
					geometry: { type: 'MultiLineString', coordinates: [line, line] },
				},
				{
					type: 'Feature',
					properties: { name: 'North basin' },
					geometry: { type: 'Polygon', coordinates: [square] },
				},
			],
		});

		const { groups, error } = collectImportGroups(text, 'routes.geojson', LINE_KINDS);

		expect(error).toBeUndefined();
		expect(groups).toHaveLength(2);
		expect(groups[0]?.name).toBe('Levee walk');
		expect(groups[0]?.geometries).toHaveLength(2);
		expect(groups[1]?.skipped).toBe(true);
	});

	it('reports malformed input instead of throwing', () => {
		const { groups, error } = collectImportGroups('{ not json', 'broken.geojson', POLYGON_KINDS);
		expect(error).toBeDefined();
		expect(groups).toEqual([]);
	});
});

describe('importCandidatesFrom', () => {
	it('numbers multi-part groups, names unnamed ones, and counts skips', () => {
		const groups = [
			{
				name: 'Split',
				geometries: [
					{ type: 'Polygon' as const, coordinates: [square] },
					{ type: 'Polygon' as const, coordinates: [square] },
				],
				skipped: false,
			},
			{
				name: null,
				geometries: [{ type: 'Polygon' as const, coordinates: [square] }],
				skipped: false,
			},
			{ name: 'A point', geometries: [], skipped: true },
		];

		const result = importCandidatesFrom(groups, { limit: 10, fallbackName: 'Shape' });

		expect(result.candidates.map((candidate) => candidate.name)).toEqual([
			'Split (1)',
			'Split (2)',
			'Shape 3',
		]);
		expect(result.skipped).toBe(1);
		expect(result.truncated).toBe(false);
	});

	it('caps at the limit and flags truncation', () => {
		const groups = Array.from({ length: 5 }, () => ({
			name: null,
			geometries: [{ type: 'Polygon' as const, coordinates: [square] }],
			skipped: false,
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
});

describe('importVertexCount', () => {
	it('counts a polygon ring without its closing position', () => {
		expect(importVertexCount({ type: 'Polygon', coordinates: [square] })).toBe(4);
		expect(importVertexCount({ type: 'LineString', coordinates: line })).toBe(3);
	});
});

describe('isImportGeometryKind', () => {
	it('names the kinds the parser can produce', () => {
		expect(isImportGeometryKind('Polygon')).toBe(true);
		expect(isImportGeometryKind('LineString')).toBe(true);
	});

	it('rejects a shape the parser has no arm for', () => {
		expect(isImportGeometryKind('Point')).toBe(false);
		expect(isImportGeometryKind('MultiPolygon')).toBe(false);
		expect(isImportGeometryKind('toString')).toBe(false);
	});
});
