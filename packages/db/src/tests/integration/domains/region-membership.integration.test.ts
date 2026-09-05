import {
	CORPUS_REGION,
	type CorpusCase,
	type CorpusGeomType,
	corpusRegionFor,
	REGION_MEMBERSHIP_CORPUS,
	REGION_MEMBERSHIP_CORPUS_SIZE,
} from '@simmer-mosquito/mapping/test-corpus';
import { type RawBuilder, sql } from 'kysely';
import { expect, it } from 'vitest';
import {
	regionMembershipClauses,
	regionMembershipMatch,
} from '../../../domains/map-region-filter.js';
import { readRecordRegions } from '../../../domains/region-membership.js';
import type { DbExecutor } from '../../../index.js';
import { describeDbIntegration, withTestDb } from '../../../test-support/db-integration.js';

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
// one, so thirty-two blocks would be thirty-two migration runs. Seed once,
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
	await db
		.insertInto('organizations')
		.values(
			CORPUS_REGIONS.map((_region, index) => ({
				id: orgId(index),
				workos_organization_id: `org_region_membership_corpus_${index}`,
				name: `Corpus District ${index}`,
			})),
		)
		.execute();

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

			// `ST_Intersects and not ST_Touches` is algebraically the areal branch
			// at two GEOS calls instead of one, so it is the cross-check rather than
			// the shipped expression. A disagreement is a bug in the DE-9IM pattern.
			for (const corpusCase of REGION_MEMBERSHIP_CORPUS) {
				if (corpusCase.branch !== 'interior-intersection') {
					continue;
				}
				expect(seen.get(corpusCase.id)?.touches_cross_check, corpusCase.id).toBe(corpusCase.inside);
			}

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

// --- an invalid stored region -------------------------------------------------
//
// Fifteen production Regions hold a self-intersecting ring, GEOS leaves a relate
// on one undefined, and #437 measured the answers and left the rows alone. ADR
// 0015's Consequences bullet on validity has the numbers and the reasoning.
//
// This is PostGIS pinned in place, not a rule, which is why it is beside the
// corpus rather than in it: mobile cannot be asked to reproduce an undefined
// answer. A case that starts failing means GEOS changed its mind about invalid
// input, and the fifteen rows need measuring again.
//
// A second `withTestDb` is a second migration run. The corpus block argues
// against that for thirty-two blocks; this is one, and it buys an invalid Region
// that no corpus case can be answered against by accident.

const invalidRingOrgId = '00000000-0000-4000-8000-000000000700';
const invalidRingFolderId = '00000000-0000-4000-8000-000000000701';
const invalidRingRegionId = '00000000-0000-4000-8000-000000000702';
const invalidRingHabitatId = (index: number) =>
	`00000000-0000-4000-8000-${String(720 + index).padStart(12, '0')}`;

/**
 * A bow-tie, at the corpus's magnitudes near longitude -90.
 *
 * The ring runs from the south-west corner diagonally to the north-east, down the
 * east side, then back across itself to a point halfway up the west side. The two
 * edges cross, which is the fault all fifteen production rows have.
 *
 * That leaves two lobes. The east one is large, reaching longitude -89.9 between
 * latitude 30.0 and 30.1; the west one is small, against longitude -90.0 between
 * latitude 30.0 and 30.05. They are wound in opposite directions, so the ring's
 * area is the difference between them and the repaired area is the sum.
 * `5-21: Millstone River - East` in production is this shape, and repairing it
 * turns 11.28 ha into 41.42 ha.
 */
const INVALID_RING = 'POLYGON((-90.0 30.0, -89.9 30.1, -89.9 30.0, -90.0 30.05, -90.0 30.0))';

/**
 * WKT, where the corpus above uses GeoJSON. A ring that crosses itself has to be
 * read vertex by vertex to be believed, and one line of WKT is where that is
 * legible.
 */
function wkt(value: string): RawBuilder<string> {
	return sql<string>`st_setsrid(st_geomfromtext(${value}), 4326)`;
}

interface InvalidRingCase {
	readonly id: string;
	readonly geomType: CorpusGeomType;
	readonly record: string;
	/** What the stored, invalid ring answers. */
	readonly inside: boolean;
	/** What the same call answers against `ST_MakeValid` of that ring. */
	readonly insideRepaired: boolean;
	/** Why the answer is what it is. Read this before changing an expectation. */
	readonly because: string;
}

const INVALID_RING_CASES: readonly InvalidRingCase[] = [
	{
		id: 'point-in-a-lobe',
		geomType: 'st_point',
		record: 'POINT(-89.92 30.05)',
		inside: true,
		insideRepaired: true,
		because: 'Well inside the east lobe, which is covered ground under either reading.',
	},
	{
		id: 'point-in-the-notch',
		geomType: 'st_point',
		record: 'POINT(-89.95 30.075)',
		inside: false,
		insideRepaired: false,
		because: 'West of the east lobe and north of the west one, so it is in neither.',
	},
	{
		id: 'line-crossing-a-lobe',
		geomType: 'st_linestring',
		record: 'LINESTRING(-89.925 30.05, -89.85 30.05)',
		inside: true,
		insideRepaired: true,
		because: 'Starts in the east lobe and runs out of it, on the plain-intersection arm.',
	},
	{
		id: 'polygon-interior-meeting-a-lobe',
		geomType: 'st_polygon',
		record:
			'POLYGON((-89.925 30.025, -89.875 30.025, -89.875 30.075, -89.925 30.075, -89.925 30.025))',
		inside: true,
		insideRepaired: true,
		because: 'Overlaps the east lobe, so the interiors meet.',
	},
	{
		id: 'polygon-in-the-notch',
		geomType: 'st_polygon',
		record: 'POLYGON((-89.96 30.08, -89.94 30.08, -89.94 30.095, -89.96 30.095, -89.96 30.08))',
		inside: false,
		insideRepaired: false,
		because: 'Sits in the notch, meeting neither lobe.',
	},
	{
		// The one case where validity decides. Its east side lies on longitude
		// -90.0, a literal in the ring, so the contact is exact rather than a
		// rounding accident, and the repaired answer is the one the rule wants:
		// work sharing an edge with a Region is next to it, not in it.
		id: 'polygon-abutting-the-ring',
		geomType: 'st_polygon',
		record: 'POLYGON((-90.05 30.0, -90.0 30.0, -90.0 30.1, -90.05 30.1, -90.05 30.0))',
		inside: true,
		insideRepaired: false,
		because:
			'Shares the west edge and overlaps nowhere. Repaired, the interiors miss and the answer is false.',
	},
];

interface InvalidRingRow {
	readonly id: string;
	readonly geom_type: string;
	readonly stored: boolean;
	readonly repaired: boolean;
}

interface RingShapeRow {
	readonly valid: boolean;
	readonly reason: string;
	readonly stored_type: string;
	readonly repaired_type: string;
	readonly grows: boolean;
}

async function seedInvalidRing(db: DbExecutor): Promise<void> {
	await db
		.insertInto('organizations')
		.values({
			id: invalidRingOrgId,
			workos_organization_id: 'org_region_membership_invalid_ring',
			name: 'Invalid Ring Organization',
		})
		.execute();

	await db
		.insertInto('region_folders')
		.values({
			id: invalidRingFolderId,
			organization_id: invalidRingOrgId,
			name: 'Invalid ring folder',
		})
		.execute();

	// This insert is also the #417 assertion: a self-intersecting ring stores.
	await db
		.insertInto('regions')
		.values({
			id: invalidRingRegionId,
			organization_id: invalidRingOrgId,
			region_folder_id: invalidRingFolderId,
			name: 'Invalid ring region',
			geom: wkt(INVALID_RING),
		})
		.execute();

	await db
		.insertInto('habitats')
		.values(
			INVALID_RING_CASES.map((ringCase, index) => ({
				id: invalidRingHabitatId(index),
				organization_id: invalidRingOrgId,
				geom: wkt(ringCase.record),
				description: ringCase.id,
			})),
		)
		.execute();
}

describeDbIntegration('region membership against a self-intersecting region', () => {
	it('answers the repaired way on every case but the one abutting the ring', async () => {
		await withTestDb(async ({ db }) => {
			await seedInvalidRing(db);

			// A ring that turned out valid would make every assertion below vacuous,
			// so the fault is proved before anything is asked about it.
			const shape = await sql<RingShapeRow>`
				select
					st_isvalid(geom) as valid,
					st_isvalidreason(geom) as reason,
					geometrytype(geom) as stored_type,
					geometrytype(st_makevalid(geom)) as repaired_type,
					st_area(st_makevalid(geom)) > st_area(geom) as grows
				from regions
				where id = ${invalidRingRegionId}
			`.execute(db);

			expect(shape.rows[0]?.valid).toBe(false);
			// Unanchored. GEOS says `Ring Self-intersection` for a ring that touches
			// itself rather than crossing, and either fault is the one being pinned.
			expect(shape.rows[0]?.reason).toMatch(/Self-intersection/);
			expect(shape.rows[0]?.stored_type).toBe('POLYGON');
			// The repair splits the bow-tie in two. `regions.geom` has taken a
			// MultiPolygon only since ADR 0018, and this one is never stored anyway:
			// it is computed inside the comparison below and thrown away.
			expect(shape.rows[0]?.repaired_type).toBe('MULTIPOLYGON');
			// Repair is not cosmetic on this shape, which is the second reason #437
			// left the fifteen alone: it would redraw a boundary somebody drew.
			expect(shape.rows[0]?.grows).toBe(true);

			const idOfRecord = new Map(
				INVALID_RING_CASES.map((ringCase, index) => [invalidRingHabitatId(index), ringCase.id]),
			);

			const answers = await sql<InvalidRingRow>`
				select
					h.id,
					h.geom_type,
					${regionMembershipMatch({
						geom: sql`h.geom`,
						geomType: sql`h.geom_type`,
						regionGeom: sql`rf.geom`,
					})} as stored,
					${regionMembershipMatch({
						geom: sql`h.geom`,
						geomType: sql`h.geom_type`,
						regionGeom: sql`st_makevalid(rf.geom)`,
					})} as repaired
				from habitats h
				join regions rf on rf.id = ${invalidRingRegionId}
				where h.organization_id = ${invalidRingOrgId}
			`.execute(db);

			// A loop that silently iterates nothing passes. Every case has to be here.
			expect(new Set(answers.rows.map((row) => idOfRecord.get(row.id)))).toEqual(
				new Set(INVALID_RING_CASES.map((ringCase) => ringCase.id)),
			);

			const answerOf = new Map(answers.rows.map((row) => [idOfRecord.get(row.id) ?? row.id, row]));

			// The branch a case takes, asserted as well as the answer it gets, for the
			// reason the corpus block gives: a misroute is right on most cases.
			expectPerCase(
				INVALID_RING_CASES,
				(id) => answerOf.get(id)?.geom_type,
				(ringCase) => ringCase.geomType,
			);
			expectPerCase(
				INVALID_RING_CASES,
				(id) => answerOf.get(id)?.stored,
				(ringCase) => ringCase.inside,
			);
			expectPerCase(
				INVALID_RING_CASES,
				(id) => answerOf.get(id)?.repaired,
				(ringCase) => ringCase.insideRepaired,
			);

			// Stated as a set rather than left to the two maps above, so the claim the
			// ADR carries is one assertion: validity decides this case and no other.
			expect(
				new Set(
					answers.rows
						.filter((row) => row.stored !== row.repaired)
						.map((row) => idOfRecord.get(row.id)),
				),
			).toEqual(new Set(['polygon-abutting-the-ring']));

			// --- the Region multiselect ------------------------------------------
			// Through the whole clause this time, `&&` prefilter included, which is
			// the only place the abutting case could be dropped before the branch runs.
			const filtered = await sql<{ readonly id: string }>`
				select h.id
				from habitats h
				where h.organization_id = ${invalidRingOrgId}
					and ${
						regionMembershipClauses({
							geom: sql`h.geom`,
							geomType: sql`h.geom_type`,
							organizationId: sql`h.organization_id`,
							regionIds: [invalidRingRegionId],
						})[0]
					}
			`.execute(db);

			expect(new Set(filtered.rows.map((row) => idOfRecord.get(row.id)))).toEqual(
				new Set(
					INVALID_RING_CASES.filter((ringCase) => ringCase.inside).map((ringCase) => ringCase.id),
				),
			);

			// --- the detail-page read --------------------------------------------
			// An invalid geometry is exactly where two call paths could drift, so both
			// run, the way the corpus block runs both.
			const read = await Promise.all(
				INVALID_RING_CASES.map(async (ringCase, index) => {
					const answer = await readRecordRegions(db, {
						recordType: 'habitats',
						recordId: invalidRingHabitatId(index),
						organizationId: invalidRingOrgId,
					});
					return [ringCase.id, answer] as const;
				}),
			);

			for (const [id, answer] of read) {
				expect(answer.found, id).toBe(true);
			}

			const groupsOf = new Map(read.map(([id, answer]) => [id, answer.groups.length > 0]));
			expectPerCase(
				INVALID_RING_CASES,
				(id) => groupsOf.get(id),
				(ringCase) => ringCase.inside,
			);
		});
	});
});
