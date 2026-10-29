import {
	AREA_OVERLAP_SHARE,
	CORPUS_REGION,
	type CorpusCase,
	corpusRegionFor,
	REGION_MEMBERSHIP_CORPUS,
	REGION_MEMBERSHIP_CORPUS_SIZE,
} from '@simmer-mosquito/mapping/test-corpus';
import { type RawBuilder, sql } from 'kysely';
import { expect, it } from 'vitest';
import {
	REGION_AREA_OVERLAP_SHARE,
	regionMembershipClauses,
	regionMembershipMatch,
} from '../../../domains/map-region-filter.js';
import { regionGeojsonToGeom } from '../../../domains/org-owned-writes.js';
import { readRecordRegions } from '../../../domains/region-membership.js';
import type { DbExecutor } from '../../../index.js';
import { describeDbIntegration, withTestDb } from '../../../test-support/db-integration.js';
import { createOrganization } from '../../../test-support/row-fixtures.js';

// --- the SQL half of the region-membership corpus ----------------------------
//
// `packages/mapping/src/test-corpus.ts` is the source of truth for the rule; this
// is PostGIS being held to it. The expectations there are hand-written, so a
// failure here is one of two things: the SQL branches wrongly, or the corpus is
// wrong. Read the case's `because` before deciding which.
//
// Both call paths run. `readRecordRegions` is the detail-page read and
// `regionMembershipClauses` is the Region multiselect, and ADR 0015 says they
// answer the same question, so a case that separates them is exactly the bug the
// corpus exists to catch.
//
// One `it()` and one `withTestDb`. The harness applies the whole migration set
// per call, about a second against a local container and nine against a remote
// one, so thirty-six blocks would be thirty-six migration runs. Seed once,
// assert once, and name the failing case in the diff rather than in the block
// title.
//
// Two organizations, one per distinct region. Both membership reads scope the
// region set to the record's own organization, so a case that names a multipart
// region gets a district library holding exactly that region and nothing else.
// Seeding both regions into one organization would test every case against
// both.

const orgId = (index: number) => `00000000-0000-4000-8000-${String(400 + index).padStart(12, '0')}`;
const folderId = (index: number) =>
	`00000000-0000-4000-8000-${String(420 + index).padStart(12, '0')}`;
const regionId = (index: number) =>
	`00000000-0000-4000-8000-${String(440 + index).padStart(12, '0')}`;
const habitatId = (index: number) =>
	`00000000-0000-4000-8000-${String(500 + index).padStart(12, '0')}`;

const folderName = (index: number) => `Corpus folder ${index}`;
const regionName = (index: number) => `Corpus region ${index}`;

/** The distinct regions the corpus names, in the order it first names them. */
const CORPUS_REGIONS = [
	...new Set(REGION_MEMBERSHIP_CORPUS.map((corpusCase) => corpusRegionFor(corpusCase))),
];

interface SeededCase {
	readonly corpusCase: CorpusCase;
	readonly habitatId: string;
	readonly organizationId: string;
}

const SEEDED: readonly SeededCase[] = REGION_MEMBERSHIP_CORPUS.map((corpusCase, index) => {
	const regionIndex = CORPUS_REGIONS.indexOf(corpusRegionFor(corpusCase));
	return {
		corpusCase,
		habitatId: habitatId(index),
		organizationId: orgId(regionIndex),
	};
});

function geometry(value: unknown): RawBuilder<string> {
	return sql<string>`st_setsrid(st_geomfromgeojson(${JSON.stringify(value)}), 4326)`;
}

/**
 * Every case, both blocks: the answer keyed by case id, against the expectation
 * keyed the same way.
 *
 * Keyed rather than compared pairwise so a failure names the case that broke.
 * Vitest prints the whole object diff, and a positional array would print two
 * lists of booleans and leave the reader counting.
 */
function expectPerCase<Case extends { readonly id: string }>(
	cases: readonly Case[],
	actual: (id: string) => unknown,
	expected: (item: Case) => unknown,
): void {
	expect(Object.fromEntries(cases.map((item) => [item.id, actual(item.id)]))).toEqual(
		Object.fromEntries(cases.map((item) => [item.id, expected(item)])),
	);
}

async function seedCorpus(db: DbExecutor): Promise<void> {
	// One Organization per distinct region, row at a time rather than in one
	// insert, so the columns `organizations` requires are named in one place for
	// every suite instead of here as well.
	for (const [index] of CORPUS_REGIONS.entries()) {
		await createOrganization(db, { id: orgId(index) });
	}

	await db
		.insertInto('region_folders')
		.values(
			CORPUS_REGIONS.map((_region, index) => ({
				id: folderId(index),
				organization_id: orgId(index),
				name: folderName(index),
			})),
		)
		.execute();

	// One of the two regions is a MultiPolygon, which `regions.geom` only holds
	// once the multipart migration has run. That is why the corpus grew inside the
	// migration slice: seeded any earlier, these cases fail on the insert rather
	// than on the predicate.
	await db
		.insertInto('regions')
		.values(
			CORPUS_REGIONS.map((region, index) => ({
				id: regionId(index),
				organization_id: orgId(index),
				region_folder_id: folderId(index),
				name: regionName(index),
				geom: geometry(region),
			})),
		)
		.execute();

	// Every case is a habitat. `habitats.geom` is `geometry(Geometry, 4326)` held
	// to all six shapes by its CHECK, so one table holds every case and the seed
	// stays one insert.
	await db
		.insertInto('habitats')
		.values(
			SEEDED.map((seeded) => ({
				id: seeded.habitatId,
				organization_id: seeded.organizationId,
				geom: geometry(seeded.corpusCase.record),
				description: seeded.corpusCase.id,
			})),
		)
		.execute();
}

interface BranchRow {
	readonly id: string;
	readonly geom_type: string;
	readonly matched: boolean;
	readonly interiors_meet: boolean;
	readonly touches_cross_check: boolean;
}

describeDbIntegration('region membership corpus, SQL half', () => {
	it('answers every case the way the corpus says, on both call paths', async () => {
		await withTestDb(async ({ db }) => {
			await seedCorpus(db);

			const idOf = new Map(SEEDED.map((seeded) => [seeded.habitatId, seeded.corpusCase.id]));
			const organizationIds = CORPUS_REGIONS.map((_region, index) => orgId(index));

			// --- the predicate itself, per case, plus the cross-check ------------
			// Each organization holds one region, so the join gives one row per
			// habitat and each case is tested against the region its corpus entry
			// names.
			const branchRows = await sql<BranchRow>`
				select
					h.id,
					h.geom_type,
					${regionMembershipMatch({
						geom: sql`h.geom`,
						geomType: sql`h.geom_type`,
						regionGeom: sql`rf.geom`,
					})} as matched,
					st_relate(rf.geom, h.geom, 'T********') as interiors_meet,
					(st_intersects(rf.geom, h.geom) and not st_touches(rf.geom, h.geom))
						as touches_cross_check
				from habitats h
				join regions rf on rf.organization_id = h.organization_id
				where h.organization_id = any(${organizationIds}::uuid[])
			`.execute(db);

			// A loop that silently iterates nothing passes. This is what stops that:
			// the seeded set and the corpus have to be the same set, by id.
			expect(new Set(branchRows.rows.map((row) => idOf.get(row.id)))).toEqual(
				new Set(REGION_MEMBERSHIP_CORPUS.map((corpusCase) => corpusCase.id)),
			);
			expect(branchRows.rows).toHaveLength(REGION_MEMBERSHIP_CORPUS_SIZE);

			const seen = new Map(branchRows.rows.map((row) => [idOf.get(row.id) ?? row.id, row]));

			// The branch a case takes is asserted as well as the answer it gets. A
			// MultiPolygon wrongly routed through plain intersection is right on
			// every case here but two, so the stored `geom_type` is what proves the
			// route.
			expectPerCase(
				REGION_MEMBERSHIP_CORPUS,
				(id) => seen.get(id)?.geom_type,
				(corpusCase) => corpusCase.geomType,
			);

			expectPerCase(
				REGION_MEMBERSHIP_CORPUS,
				(id) => seen.get(id)?.matched,
				(corpusCase) => corpusCase.inside,
			);

			// `ST_Intersects and not ST_Touches` is algebraically the DE-9IM interior
			// cell at two GEOS calls instead of one, so it is the cross-check on the
			// pattern. A disagreement is a bug in the pattern.
			const interiorCases = REGION_MEMBERSHIP_CORPUS.filter(
				(corpusCase) => corpusCase.branch === 'interior-intersection',
			);
			expectPerCase(
				interiorCases,
				(id) => seen.get(id)?.touches_cross_check,
				(corpusCase) => seen.get(corpusCase.id)?.interiors_meet,
			);

			// The overlap threshold is what answers false where the interiors meet,
			// and on the corpus it does that for the sliver and nothing else.
			expect(
				new Set(
					interiorCases
						.filter((corpusCase) => seen.get(corpusCase.id)?.interiors_meet === true)
						.filter((corpusCase) => !corpusCase.inside)
						.map((corpusCase) => corpusCase.id),
				),
			).toEqual(new Set(['polygon-sliver-overlap']));

			// --- the Region multiselect ------------------------------------------
			// Both region ids go in. The clause scopes the region set to the
			// record's own organization, so each habitat is still tested against one.
			const filtered = await sql<{ readonly id: string }>`
				select h.id
				from habitats h
				where h.organization_id = any(${organizationIds}::uuid[])
					and ${
						regionMembershipClauses({
							geom: sql`h.geom`,
							geomType: sql`h.geom_type`,
							organizationId: sql`h.organization_id`,
							regionIds: CORPUS_REGIONS.map((_region, index) => regionId(index)),
						})[0]
					}
			`.execute(db);

			expect(new Set(filtered.rows.map((row) => idOf.get(row.id)))).toEqual(
				new Set(
					REGION_MEMBERSHIP_CORPUS.filter((corpusCase) => corpusCase.inside).map(
						(corpusCase) => corpusCase.id,
					),
				),
			);

			// --- the detail-page read --------------------------------------------
			const read = await Promise.all(
				SEEDED.map(async (seeded) => {
					const answer = await readRecordRegions(db, {
						recordType: 'habitats',
						recordId: seeded.habitatId,
						organizationId: seeded.organizationId,
					});
					return [seeded.corpusCase.id, answer] as const;
				}),
			);

			for (const [id, answer] of read) {
				expect(answer.found, id).toBe(true);
			}

			const matchedRegions = new Map(read.map(([id, answer]) => [id, answer.groups.length > 0]));
			expectPerCase(
				REGION_MEMBERSHIP_CORPUS,
				(id) => matchedRegions.get(id),
				(corpusCase) => corpusCase.inside,
			);

			// The shape the panel renders, proved once on a case that matches.
			const sharedIndex = CORPUS_REGIONS.indexOf(CORPUS_REGION);
			const inside = read.find(([id]) => id === 'point-inside');
			expect(inside?.[1].groups).toEqual([
				{
					folderId: folderId(sharedIndex),
					folderName: folderName(sharedIndex),
					regions: [{ id: regionId(sharedIndex), name: regionName(sharedIndex) }],
				},
			]);
		});
	});
});

// --- validity, and the threshold at its line ---------------------------------
//
// #1671 made the area arm measure the overlap, and `st_intersection` throws on a
// ring that crosses itself. So a Region is repaired on write and a CHECK holds
// it valid, while a record area keeps the shape Split writes and the predicate
// reads it through `st_makevalid` where it is invalid. ADR 0015's 2026-10-13
// amendment has the reasoning.
//
// None of this is in the corpus. The corpus is shapes both halves can answer by
// hand, and a self-intersecting ring is not one of them. The threshold pair in
// the corpus sits an order of magnitude either side of the line; the boundary
// pair here sits at 0.0997% and 0.1002%, which is a statement about this
// implementation's arithmetic rather than a rule for mobile.
//
// A second `withTestDb` is a second migration run. The corpus block argues
// against that for thirty-six blocks; this is one.

const validityOrgId = '00000000-0000-4000-8000-000000000700';
const validityRegionId = '00000000-0000-4000-8000-000000000702';
const bowTieRegionId = '00000000-0000-4000-8000-000000000703';
const validityHabitatId = (index: number) =>
	`00000000-0000-4000-8000-${String(720 + index).padStart(12, '0')}`;

/**
 * A bow-tie, at the corpus's magnitudes near longitude -90.
 *
 * The ring runs from the south-west corner diagonally to the north-east, down the
 * east side, then back across itself to a point halfway up the west side. The two
 * edges cross at (-89.96667, 30.03333), which is the fault the fifteen production
 * Regions #1671 repaired had.
 *
 * That leaves two lobes wound in opposite directions: a triangle of 0.0033333
 * square degrees against longitude -89.9, and one of 0.00083333 against -90.0.
 * The shoelace area of the ring is their difference, 0.0025, and the repaired
 * area is their sum. `5-21: Millstone River - East` is this shape, and repair
 * took its stored area from 112,765 m² to its lobes' 414,171 m² without moving
 * its outline.
 */
const BOW_TIE = 'POLYGON((-90.0 30.0, -89.9 30.1, -89.9 30.0, -90.0 30.05, -90.0 30.0))';
const BOW_TIE_LOBES_AREA = 0.0033333333 + 0.0008333333;

/** A plain valid Region, the corpus's outer square without its hole. */
const SQUARE = 'POLYGON((-90.0 30.0, -89.9 30.0, -89.9 30.1, -90.0 30.1, -90.0 30.0))';

/**
 * WKT, where the corpus above uses GeoJSON. A ring that crosses itself has to be
 * read vertex by vertex to be believed, and one line of WKT is where that is
 * legible.
 */
function wkt(value: string): RawBuilder<string> {
	return sql<string>`st_setsrid(st_geomfromtext(${value}), 4326)`;
}

interface ValidityCase {
	readonly id: string;
	/** Which Region the case is asked against. */
	readonly region: 'square' | 'repaired-bow-tie';
	readonly record: string;
	readonly inside: boolean;
	/** Why the answer is what it is. Read this before changing an expectation. */
	readonly because: string;
}

const VALIDITY_CASES: readonly ValidityCase[] = [
	{
		id: 'just-under-the-threshold',
		region: 'square',
		record:
			'POLYGON((-90.1 30.02, -89.9999002 30.02, -89.9999002 30.04, -90.1 30.04, -90.1 30.02))',
		inside: false,
		because:
			'The overlap is 0.0000998 by 0.02 against a record of 0.1000998 by 0.02, about 0.0997% ' +
			'of the record, the smaller area.',
	},
	{
		id: 'just-over-the-threshold',
		region: 'square',
		record:
			'POLYGON((-90.1 30.02, -89.9998997 30.02, -89.9998997 30.04, -90.1 30.04, -90.1 30.02))',
		inside: true,
		because: 'The same record reaching 0.0001003 past the edge, about 0.1002% of the record.',
	},
	{
		id: 'bow-tie-record-inside',
		region: 'square',
		record: BOW_TIE,
		inside: true,
		because:
			'A record area may still cross itself, because Split writes an invalid shape on ' +
			'purpose. Read through `st_makevalid` it is both lobes, wholly inside the square, and ' +
			'the read answers rather than throwing.',
	},
	{
		id: 'abutting-the-repaired-region',
		region: 'repaired-bow-tie',
		record: 'POLYGON((-90.05 30.0, -90.0 30.0, -90.0 30.1, -90.05 30.1, -90.05 30.0))',
		inside: false,
		because:
			"Shares the repaired Region's west edge and overlaps nowhere. Against the unrepaired " +
			'ring this answered true, which was the one case #437 found that validity decided.',
	},
	{
		id: 'overlapping-the-repaired-east-lobe',
		region: 'repaired-bow-tie',
		record:
			'POLYGON((-89.925 30.025, -89.875 30.025, -89.875 30.075, -89.925 30.075, -89.925 30.025))',
		inside: true,
		because: 'Covers a quarter of its own area inside the east lobe.',
	},
];

interface StoredRegionRow {
	readonly valid: boolean;
	readonly type: string;
	readonly parts: number;
	readonly area: number;
}

interface ValidityRow {
	readonly id: string;
	readonly matched: boolean;
}

async function seedValidity(db: DbExecutor): Promise<void> {
	await createOrganization(db, { id: validityOrgId });

	await db
		.insertInto('regions')
		.values([
			{
				id: validityRegionId,
				organization_id: validityOrgId,
				name: 'Square',
				geom: wkt(SQUARE),
			},
			{
				id: bowTieRegionId,
				organization_id: validityOrgId,
				name: 'Repaired bow-tie',
				// The writer's own path: GeoJSON in, `valid_region_geom` around it.
				geom: regionGeojsonToGeom({
					type: 'Polygon',
					coordinates: [
						[
							[-90.0, 30.0],
							[-89.9, 30.1],
							[-89.9, 30.0],
							[-90.0, 30.05],
							[-90.0, 30.0],
						],
					],
				}),
			},
		])
		.execute();

	// Habitats take an invalid area without complaint. That is the shape Split
	// writes, kept on purpose by #518, and this insert is what says it still stores.
	await db
		.insertInto('habitats')
		.values(
			VALIDITY_CASES.map((validityCase, index) => ({
				id: validityHabitatId(index),
				organization_id: validityOrgId,
				geom: wkt(validityCase.record),
				description: validityCase.id,
			})),
		)
		.execute();
}

describeDbIntegration('region membership, validity and the threshold at its line', () => {
	it('repairs Regions, reads invalid record areas, and holds the 0.1% line', async () => {
		await withTestDb(async ({ db }) => {
			// The two halves of the rule carry one number. A change to either that
			// leaves the other behind fails here first.
			expect(REGION_AREA_OVERLAP_SHARE).toBe(AREA_OVERLAP_SHARE);

			await seedValidity(db);

			// --- the Region side ----------------------------------------------
			// A raw self-intersecting ring is refused by the CHECK. The writer's
			// path is what repairs; a write that skips it does not get to store.
			await expect(
				db
					.insertInto('regions')
					.values({
						organization_id: validityOrgId,
						name: 'Unrepaired bow-tie',
						geom: wkt(BOW_TIE),
					})
					.execute(),
			).rejects.toMatchObject({ code: '23514', constraint: 'regions_geom_valid_check' });

			const stored = await sql<StoredRegionRow>`
				select
					st_isvalid(geom) as valid,
					geometrytype(geom) as type,
					st_numgeometries(geom) as parts,
					st_area(geom) as area
				from regions
				where id = ${bowTieRegionId}
			`.execute(db);

			// Both lobes, as a MultiPolygon, with their summed area. A repair that kept
			// one lobe, or stored the shoelace difference, fails on the area.
			expect(stored.rows[0]?.valid).toBe(true);
			expect(stored.rows[0]?.type).toBe('MULTIPOLYGON');
			expect(Number(stored.rows[0]?.parts)).toBe(2);
			expect(Number(stored.rows[0]?.area)).toBeCloseTo(BOW_TIE_LOBES_AREA, 8);

			// A valid ring goes through `valid_region_geom` untouched, so a Polygon
			// stays a Polygon and nothing about an ordinary save changes.
			const untouched = await sql<{ readonly same: boolean }>`
				select st_equals(valid_region_geom(${wkt(SQUARE)}), ${wkt(SQUARE)})
					and geometrytype(valid_region_geom(${wkt(SQUARE)})) = 'POLYGON' as same
			`.execute(db);
			expect(untouched.rows[0]?.same).toBe(true);

			// --- the predicate --------------------------------------------------
			const idOfRecord = new Map(
				VALIDITY_CASES.map((validityCase, index) => [validityHabitatId(index), validityCase.id]),
			);
			const regionOf = (validityCase: ValidityCase) =>
				validityCase.region === 'square' ? validityRegionId : bowTieRegionId;

			const answers = await Promise.all(
				VALIDITY_CASES.map(async (validityCase, index) => {
					const row = await sql<ValidityRow>`
						select
							h.id,
							${regionMembershipMatch({
								geom: sql`h.geom`,
								geomType: sql`h.geom_type`,
								regionGeom: sql`rf.geom`,
							})} as matched
						from habitats h
						join regions rf on rf.id = ${regionOf(validityCase)}
						where h.id = ${validityHabitatId(index)}
					`.execute(db);
					return row.rows[0];
				}),
			);

			// A loop that silently iterates nothing passes. Every case has to be here.
			expect(new Set(answers.map((row) => idOfRecord.get(row?.id ?? '')))).toEqual(
				new Set(VALIDITY_CASES.map((validityCase) => validityCase.id)),
			);

			const answerOf = new Map(answers.map((row) => [idOfRecord.get(row?.id ?? ''), row]));
			expectPerCase(
				VALIDITY_CASES,
				(id) => answerOf.get(id)?.matched,
				(validityCase) => validityCase.inside,
			);

			// --- the Region multiselect -----------------------------------------
			// Through the whole clause, `&&` prefilter included, one Region at a
			// time so each case meets only the Region it names.
			for (const region of ['square', 'repaired-bow-tie'] as const) {
				const cases = VALIDITY_CASES.filter((validityCase) => validityCase.region === region);
				const filtered = await sql<{ readonly id: string }>`
					select h.id
					from habitats h
					where h.id = any(${cases.map((validityCase) => validityHabitatId(VALIDITY_CASES.indexOf(validityCase)))}::uuid[])
						and ${
							regionMembershipClauses({
								geom: sql`h.geom`,
								geomType: sql`h.geom_type`,
								organizationId: sql`h.organization_id`,
								regionIds: [region === 'square' ? validityRegionId : bowTieRegionId],
							})[0]
						}
				`.execute(db);

				expect(new Set(filtered.rows.map((row) => idOfRecord.get(row.id))), region).toEqual(
					new Set(
						cases
							.filter((validityCase) => validityCase.inside)
							.map((validityCase) => validityCase.id),
					),
				);
			}
		});
	});
});
