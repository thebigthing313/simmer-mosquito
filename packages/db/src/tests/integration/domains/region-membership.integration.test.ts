import {
	CORPUS_REGION,
	type CorpusCase,
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
// Two agencies, one per distinct region. Both membership reads scope the region
// set to the record's own agency, so a case that names a multipart region gets a
// district library holding exactly that region and nothing else. Seeding both
// regions into one agency would test every case against both.

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
			// Each agency holds one region, so the join gives one row per habitat
			// and each case is tested against the region its corpus entry names.
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
			expect(
				Object.fromEntries(
					REGION_MEMBERSHIP_CORPUS.map((corpusCase) => [
						corpusCase.id,
						seen.get(corpusCase.id)?.geom_type,
					]),
				),
			).toEqual(
				Object.fromEntries(
					REGION_MEMBERSHIP_CORPUS.map((corpusCase) => [corpusCase.id, corpusCase.geomType]),
				),
			);

			expect(
				Object.fromEntries(
					REGION_MEMBERSHIP_CORPUS.map((corpusCase) => [
						corpusCase.id,
						seen.get(corpusCase.id)?.matched,
					]),
				),
			).toEqual(
				Object.fromEntries(
					REGION_MEMBERSHIP_CORPUS.map((corpusCase) => [corpusCase.id, corpusCase.inside]),
				),
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
			// record's own agency, so each habitat is still tested against one.
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

			expect(
				Object.fromEntries(read.map(([id, answer]) => [id, answer.groups.length > 0])),
			).toEqual(
				Object.fromEntries(
					REGION_MEMBERSHIP_CORPUS.map((corpusCase) => [corpusCase.id, corpusCase.inside]),
				),
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
