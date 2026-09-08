import { describe, expect, it } from 'vitest';

import {
	CORPUS_REGION,
	type CorpusCase,
	corpusRegionFor,
	membershipBranchFor,
	REGION_MEMBERSHIP_CORPUS,
	REGION_MEMBERSHIP_CORPUS_SIZE,
} from '../../test-corpus.js';

/**
 * The corpus as data, checked unconditionally.
 *
 * The SQL half needs Postgres, and `describeDbIntegration` is `describe.skip`
 * without `TEST_DATABASE_URL`, so a developer without a container gets a green
 * run that proved nothing about the corpus. These assertions do not need a
 * database and so always run: they catch a case lost to a merge, a duplicate id,
 * a dimension that stopped being covered, and a `geomType` that disagrees with
 * the geometry beside it.
 */
describe('region membership corpus', () => {
	it('holds the checked-in number of cases', () => {
		expect(REGION_MEMBERSHIP_CORPUS).toHaveLength(REGION_MEMBERSHIP_CORPUS_SIZE);
	});

	it('gives every case a unique id', () => {
		const ids = REGION_MEMBERSHIP_CORPUS.map((corpusCase) => corpusCase.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('covers all six record shapes', () => {
		const shapes = new Set(REGION_MEMBERSHIP_CORPUS.map((corpusCase) => corpusCase.geomType));
		expect([...shapes].sort()).toEqual([
			'st_linestring',
			'st_multilinestring',
			'st_multipoint',
			'st_multipolygon',
			'st_point',
			'st_polygon',
		]);
	});

	it('covers both branches and both answers', () => {
		const branches = new Set(REGION_MEMBERSHIP_CORPUS.map((corpusCase) => corpusCase.branch));
		expect([...branches].sort()).toEqual(['interior-intersection', 'plain-intersection']);

		const answers = new Set(REGION_MEMBERSHIP_CORPUS.map((corpusCase) => corpusCase.inside));
		expect([...answers].sort()).toEqual([false, true]);
	});

	it('routes every case the way the rule says', () => {
		for (const corpusCase of REGION_MEMBERSHIP_CORPUS) {
			expect(corpusCase.branch, corpusCase.id).toBe(membershipBranchFor(corpusCase.geomType));
		}
	});

	it('labels every case with the shape of the geometry it carries', () => {
		const expected: Record<CorpusCase['geomType'], string> = {
			st_point: 'Point',
			st_linestring: 'LineString',
			st_polygon: 'Polygon',
			st_multipoint: 'MultiPoint',
			st_multilinestring: 'MultiLineString',
			st_multipolygon: 'MultiPolygon',
		};
		for (const corpusCase of REGION_MEMBERSHIP_CORPUS) {
			expect(corpusCase.record.type, corpusCase.id).toBe(expected[corpusCase.geomType]);
		}
	});

	it('explains every case', () => {
		for (const corpusCase of REGION_MEMBERSHIP_CORPUS) {
			expect(corpusCase.because.length, corpusCase.id).toBeGreaterThan(20);
		}
	});

	it('runs every case against the shared region but the two that name a multipart one', () => {
		// A case may bring its own region when the shared one cannot express it,
		// and two do: the shared region is a single Polygon, and a multipart region
		// cannot be built from the record side. Naming them here keeps an added
		// region a decision someone made on purpose.
		const named = REGION_MEMBERSHIP_CORPUS.filter(
			(corpusCase) => corpusRegionFor(corpusCase) !== CORPUS_REGION,
		);

		expect(named.map((corpusCase) => corpusCase.id)).toEqual([
			'multipolygon-region-record-in-one-part',
			'multipolygon-region-record-between-parts',
		]);
		for (const corpusCase of named) {
			expect(corpusRegionFor(corpusCase).type, corpusCase.id).toBe('MultiPolygon');
		}
	});

	it('gives the shared region a hole', () => {
		// The hole is first-class. Without it, six cases test nothing.
		expect(CORPUS_REGION.coordinates).toHaveLength(2);
	});
});
