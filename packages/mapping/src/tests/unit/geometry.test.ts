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
	toLngLat,
} from '../../geometry.js';
import { type CorpusCase, corpusRegionFor, REGION_MEMBERSHIP_CORPUS } from '../../test-corpus.js';

/**
 * The point and multipoint cases, counted. Six and two today.
 *
 * Checked in beside the filter for the reason `REGION_MEMBERSHIP_CORPUS_SIZE` is
 * checked in beside the corpus: a filter that stops matching would otherwise
 * leave an empty loop passing.
 */
const CORPUS_POINT_CASE_COUNT = 8;

/**
 * The predicate's answer for a corpus case, read existentially over the record's
 * coordinates.
 *
 * A Point has one coordinate and a MultiPoint has several, and the corpus reads
 * a MultiPoint as inside when any of its points is, so one `some` covers both.
 */
function containsAnyCoordinate(corpusCase: CorpusCase): boolean {
	const region = corpusRegionFor(corpusCase);
	const { record } = corpusCase;
	if (record.type !== 'Point' && record.type !== 'MultiPoint') {
		// Refused rather than answered false, so a corpus case the filter starts
		// selecting arrives as a failure naming the case.
		throw new Error(`${corpusCase.id} is a ${record.type}, which this case does not read.`);
	}
	const positions = record.type === 'Point' ? [record.coordinates] : record.coordinates;

	return positions.some((position) => geometryContainsLngLat(region, toLngLat(position)));
}

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

	/**
	 * The corpus, on the arm this predicate implements.
	 *
	 * ADR 0015 makes `REGION_MEMBERSHIP_CORPUS` the gate every membership
	 * predicate passes, and only the SQL half crossed it. The two suites that run
	 * it live in `packages/db` behind `describeDbIntegration`, which skips
	 * silently without `TEST_DATABASE_URL`, so on a machine with no container the
	 * corpus reached the jsts oracle and no shipping code.
	 *
	 * The point and multipoint cases are the ones this predicate can answer. It
	 * reads point against area and returns false for every other shape, so the
	 * line and areal cases would assert its silence rather than the rule.
	 *
	 * A multipoint answer is existential, which is what the corpus says a set of
	 * catch basins means: it is in the district when any of its points is.
	 *
	 * The four cases above stay as they are. They cover a LineString answering
	 * false and a plain square, which the corpus does not phrase that way.
	 */
	it('answers the corpus point and multipoint cases', () => {
		const cases = REGION_MEMBERSHIP_CORPUS.filter(
			(corpusCase) => corpusCase.geomType === 'st_point' || corpusCase.geomType === 'st_multipoint',
		);
		// A filter that selects nothing agrees with everything.
		expect(cases).toHaveLength(CORPUS_POINT_CASE_COUNT);

		const answers = Object.fromEntries(
			cases.map((corpusCase) => [corpusCase.id, containsAnyCoordinate(corpusCase)]),
		);

		expect(answers).toEqual(
			Object.fromEntries(cases.map((corpusCase) => [corpusCase.id, corpusCase.inside])),
		);
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

	it('keeps the vertex average for points', () => {
		// A MultiPoint has no length and no area, so `st_centroid` averages it.
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

	it('weights a line by segment length rather than by vertex count', () => {
		// Three vertices packed into the first two degrees and one span of eight.
		// The length weighting lands at 5, the vertex average at 3.25, which is
		// the pair the issue measured against the container.
		const unevenSpacing = {
			type: 'LineString',
			coordinates: [
				[0, 0],
				[1, 0],
				[2, 0],
				[10, 0],
			],
		} as const;

		expect(ownedCentroidFromGeoJson(unevenSpacing)).toEqual({
			lng: 5,
			lat: 0,
			geomType: 'st_linestring',
		});
		expect(centroidFromGeoJson(unevenSpacing)?.lng).toBe(3.25);
	});

	it('weights multiline parts by their own length', () => {
		// A part two degrees long and a dense part a hundredth of a degree long.
		// The short one holds three of the five vertices and moves the answer by
		// a fiftieth of what an average would.
		const parts = {
			type: 'MultiLineString',
			coordinates: [
				[
					[0, 0],
					[0, 2],
				],
				[
					[10, 0],
					[10, 0.005],
					[10, 0.01],
				],
			],
		} as const;
		const centroid = ownedCentroidFromGeoJson(parts);

		// (0 * 2 + 10 * 0.01) / 2.01
		expect(centroid?.lng).toBeCloseTo(0.1 / 2.01, 12);
		expect(centroid?.geomType).toBe('st_multilinestring');
	});

	it('gives a line with no length its position back', () => {
		// Every vertex in one place, so there is no length to divide by. PostGIS
		// answers with the position; a naive weighting answers NaN.
		expect(
			ownedCentroidFromGeoJson({
				type: 'LineString',
				coordinates: [
					[-90.5, 35.5],
					[-90.5, 35.5],
					[-90.5, 35.5],
				],
			}),
		).toEqual({ lng: -90.5, lat: 35.5, geomType: 'st_linestring' });

		// Two collapsed parts average one position each, not one per vertex.
		// `st_centroid` counts the part, which is why the three repeats on the
		// left do not outvote the two on the right.
		expect(
			ownedCentroidFromGeoJson({
				type: 'MultiLineString',
				coordinates: [
					[
						[-90, 35],
						[-90, 35],
						[-90, 35],
					],
					[
						[-88, 37],
						[-88, 37],
					],
				],
			}),
		).toEqual({ lng: -89, lat: 36, geomType: 'st_multilinestring' });
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
