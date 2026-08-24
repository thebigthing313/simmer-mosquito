import {
	CORPUS_REGION,
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
// one, so twenty-two blocks would be twenty-two migration runs. Seed once,
// assert once, and name the failing case in the diff rather than in the block
// title.

const organizationId = '00000000-0000-4000-8000-000000000401';
const folderId = '00000000-0000-4000-8000-000000000402';
const regionId = '00000000-0000-4000-8000-000000000403';
const folderName = 'Corpus folder';
const regionName = 'Corpus region';

const habitatId = (index: number) =>
	`00000000-0000-4000-8000-${String(500 + index).padStart(12, '0')}`;

function geometry(value: unknown): RawBuilder<string> {
	return sql<string>`st_setsrid(st_geomfromgeojson(${JSON.stringify(value)}), 4326)`;
}

async function seedCorpus(db: DbExecutor): Promise<void> {
	await db
		.insertInto('organizations')
		.values({
			id: organizationId,
			workos_organization_id: 'org_region_membership_corpus',
			name: 'Corpus District',
		})
		.execute();

	await db
		.insertInto('region_folders')
		.values({ id: folderId, organization_id: organizationId, name: folderName })
		.execute();

	await db
		.insertInto('regions')
		.values({
			id: regionId,
			organization_id: organizationId,
			region_folder_id: folderId,
			name: regionName,
			geom: geometry(CORPUS_REGION),
		})
		.execute();

	// Every case is a habitat. `habitats.geom` is `geometry(Geometry, 4326)`, so
	// one table holds all three dimensions and the seed stays one insert.
	await db
		.insertInto('habitats')
		.values(
			REGION_MEMBERSHIP_CORPUS.map((corpusCase, index) => ({
				id: habitatId(index),
				organization_id: organizationId,
				geom: geometry(corpusCase.record),
				description: corpusCase.id,
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

			const idOf = new Map(
				REGION_MEMBERSHIP_CORPUS.map((corpusCase, index) => [habitatId(index), corpusCase.id]),
			);

			// --- the predicate itself, per case, plus the cross-check ------------
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
				cross join regions rf
				where rf.id = ${regionId} and h.organization_id = ${organizationId}
			`.execute(db);

			// A loop that silently iterates nothing passes. This is what stops that:
			// the seeded set and the corpus have to be the same set, by id.
			expect(new Set(branchRows.rows.map((row) => idOf.get(row.id)))).toEqual(
				new Set(REGION_MEMBERSHIP_CORPUS.map((corpusCase) => corpusCase.id)),
			);
			expect(branchRows.rows).toHaveLength(REGION_MEMBERSHIP_CORPUS_SIZE);

			const seen = new Map(branchRows.rows.map((row) => [idOf.get(row.id) ?? row.id, row]));

			// The branch a case takes is asserted as well as the answer it gets. A
			// polygon wrongly routed through plain intersection is right on every
			// case here but one, so the stored `geom_type` is what proves the route.
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

			// `ST_Intersects and not ST_Touches` is algebraically the polygon branch
			// at two GEOS calls instead of one, so it is the cross-check rather than
			// the shipped expression. A disagreement is a bug in the DE-9IM pattern.
			for (const corpusCase of REGION_MEMBERSHIP_CORPUS) {
				if (corpusCase.branch !== 'interior-intersection') {
					continue;
				}
				expect(seen.get(corpusCase.id)?.touches_cross_check, corpusCase.id).toBe(corpusCase.inside);
			}

			// --- the Region multiselect ------------------------------------------
			const filtered = await sql<{ readonly id: string }>`
				select h.id
				from habitats h
				where h.organization_id = ${organizationId}
					and ${
						regionMembershipClauses({
							geom: sql`h.geom`,
							geomType: sql`h.geom_type`,
							organizationId: sql`h.organization_id`,
							regionIds: [regionId],
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
				REGION_MEMBERSHIP_CORPUS.map(async (corpusCase, index) => {
					const answer = await readRecordRegions(db, {
						recordType: 'habitats',
						recordId: habitatId(index),
						organizationId,
					});
					return [corpusCase.id, answer] as const;
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
			const inside = read.find(([id]) => id === 'point-inside');
			expect(inside?.[1].groups).toEqual([
				{ folderId, folderName, regions: [{ id: regionId, name: regionName }] },
			]);
		});
	});
});
