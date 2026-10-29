import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js';
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js';
import BufferOp from 'jsts/org/locationtech/jts/operation/buffer/BufferOp.js';
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js';
import RelateOp from 'jsts/org/locationtech/jts/operation/relate/RelateOp.js';
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js';
import { describe, expect, it } from 'vitest';

import {
	AREA_OVERLAP_SHARE,
	type CorpusCase,
	corpusRegionFor,
	REGION_MEMBERSHIP_CORPUS,
	REGION_MEMBERSHIP_CORPUS_SIZE,
} from '../../test-corpus.js';

/**
 * A third voice on the corpus.
 *
 * The expectations in `test-corpus.ts` are hand-written by design, and the SQL
 * half checks them against PostGIS. That is two voices, and one of them needs a
 * database, so a developer without a container gets a green run in which nothing
 * checked the corpus at all.
 *
 * `jsts` is a **devDependency oracle** and never ships. It is the same JTS
 * lineage PostGIS reaches through GEOS, so agreement with it is not independent
 * evidence that the *rule* is right. What it is evidence of is that the
 * thirty-six hand-written booleans are the ones the rule produces, checked
 * without Postgres and without the implementation under test. When mobile's
 * hand-rolled predicate arrives, a hand-written expectation checked only by a
 * hand-rolled implementation would be one pair of eyes checking itself, and this
 * is the second pair.
 *
 * The rule, in JTS terms: `RelateOp.relate(region, record)` once, read as the
 * DE-9IM interior cell for a polygon record and as plain intersection for a point
 * or a line. A polygon record whose interior meets the region's then has to share
 * `AREA_OVERLAP_SHARE` of the smaller area, measured by `OverlayOp`. An invalid
 * record, which the Split pair is, goes through `buffer(0)` first, the JTS
 * spelling of the `ST_MakeValid` the SQL half reads it through.
 */
describe('region membership corpus, against the jsts oracle', () => {
	it('agrees with every hand-written expectation', () => {
		const answers = Object.fromEntries(
			REGION_MEMBERSHIP_CORPUS.map((corpusCase) => [corpusCase.id, oracleAnswer(corpusCase)]),
		);

		expect(answers).toEqual(
			Object.fromEntries(
				REGION_MEMBERSHIP_CORPUS.map((corpusCase) => [corpusCase.id, corpusCase.inside]),
			),
		);
		// A loop that iterates nothing agrees with everything.
		expect(Object.keys(answers)).toHaveLength(REGION_MEMBERSHIP_CORPUS_SIZE);
	});

	it('answers the boundary-only polygon differently from plain intersection', () => {
		// The one case that separates the two branches, asserted directly rather
		// than left to the table above. Without it, a corpus in which every polygon
		// answer happened to match plain intersection would pass unnoticed.
		const sharesAnEdge = caseById('polygon-sharing-one-edge');

		expect(oracleAnswer(sharesAnEdge)).toBe(false);
		expect(plainIntersection(sharesAnEdge)).toBe(true);
	});

	it('reads a multipart interior as the union of its parts', () => {
		// The multipart pair, asserted directly for the same reason. The first is
		// the case that answers wrongly today, because a MultiPolygon falls to
		// plain intersection. The second proves the union is existential: one part
		// inside is enough, and the other part being nowhere near does not matter.
		const sharesAnEdge = caseById('multipolygon-all-parts-sharing-an-edge');
		const onePartInside = caseById('multipolygon-one-part-inside');

		expect(oracleAnswer(sharesAnEdge)).toBe(false);
		expect(plainIntersection(sharesAnEdge)).toBe(true);
		expect(oracleAnswer(onePartInside)).toBe(true);
	});

	it('holds the overlap threshold an order of magnitude either side of the line', () => {
		// The pair that carries #1671, asserted directly. Both interiors meet the
		// region's, so the interior cell alone answers true for each and only the
		// measured share separates them.
		const sliver = caseById('polygon-sliver-overlap');
		const smallOverlap = caseById('polygon-small-real-overlap');

		expect(matrixFor(sliver).matches('T********')).toBe(true);
		expect(overlapShare(sliver)).toBeLessThan(AREA_OVERLAP_SHARE / 2);
		expect(oracleAnswer(sliver)).toBe(false);
		expect(overlapShare(smallOverlap)).toBeGreaterThan(AREA_OVERLAP_SHARE * 2);
		expect(oracleAnswer(smallOverlap)).toBe(true);
	});

	it('reads the shape Split writes, whose parts share the line they were cut along', () => {
		// Asserted directly for the reason the two blocks above are, and as a pair
		// because each half is a different tripwire. The corpus docblock has the
		// argument. No try/catch and no precision model: `RelateOp` is defined over
		// a shared edge and answers what PostGIS answers.
		const touching = caseById('multipolygon-split-parts-touching-the-southern-edge');
		const across = caseById('multipolygon-split-parts-across-the-southern-edge');

		expect(oracleAnswer(touching)).toBe(false);
		expect(plainIntersection(touching)).toBe(true);
		expect(oracleAnswer(across)).toBe(true);
	});
});

function caseById(id: string): CorpusCase {
	const found = REGION_MEMBERSHIP_CORPUS.find((corpusCase) => corpusCase.id === id);
	if (found === undefined) {
		throw new Error(`No corpus case ${id}.`);
	}
	return found;
}

// The factory carries the precision model and SRID. The default is a
// floating-point model, which is what the corpus wants: rounding to a grid would
// turn every boundary case into a tolerance argument, and the boundary cases are
// exact by construction.
const reader = new GeoJSONReader(new GeometryFactory());

function matrixFor(corpusCase: CorpusCase) {
	return RelateOp.relate(reader.read(corpusRegionFor(corpusCase)), reader.read(corpusCase.record));
}

function oracleAnswer(corpusCase: CorpusCase): boolean {
	const matrix = matrixFor(corpusCase);
	if (corpusCase.branch !== 'interior-intersection') {
		return matrix.isIntersects() as boolean;
	}
	return (matrix.matches('T********') as boolean) && overlapShare(corpusCase) >= AREA_OVERLAP_SHARE;
}

/** The area two areas share, as a fraction of the smaller of them. */
function overlapShare(corpusCase: CorpusCase): number {
	const region = reader.read(corpusRegionFor(corpusCase));
	const read = reader.read(corpusCase.record);
	const record = IsValidOp.isValid(read) ? read : BufferOp.bufferOp(read, 0);
	const shared = OverlayOp.intersection(region, record).getArea() as number;
	return shared / Math.min(region.getArea() as number, record.getArea() as number);
}

function plainIntersection(corpusCase: CorpusCase): boolean {
	return matrixFor(corpusCase).isIntersects() as boolean;
}
