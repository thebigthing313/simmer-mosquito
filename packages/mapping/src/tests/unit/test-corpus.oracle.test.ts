import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js';
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js';
import RelateOp from 'jsts/org/locationtech/jts/operation/relate/RelateOp.js';
import { describe, expect, it } from 'vitest';

import {
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
 * evidence that the *rule* is right. What it is evidence of is that the twenty-two
 * hand-written booleans are the ones the rule produces, checked without Postgres
 * and without the implementation under test. When mobile's hand-rolled predicate
 * arrives, a hand-written expectation checked only by a hand-rolled
 * implementation would be one pair of eyes checking itself, and this is the
 * second pair.
 *
 * The rule, in JTS terms: `RelateOp.relate(region, record)` once, read as the
 * DE-9IM interior cell for a polygon record and as plain intersection for a point
 * or a line.
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
	return corpusCase.branch === 'interior-intersection'
		? (matrix.matches('T********') as boolean)
		: (matrix.isIntersects() as boolean);
}

function plainIntersection(corpusCase: CorpusCase): boolean {
	return matrixFor(corpusCase).isIntersects() as boolean;
}
