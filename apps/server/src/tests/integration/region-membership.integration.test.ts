import { type DbExecutor, type RecordRegions, readRecordRegions, sql } from '@simmer-mosquito/db';
import { describeDbIntegration, withTestDb } from '@simmer-mosquito/db/test-support';
import { expect, it } from 'vitest';

/**
 * What the regions read answers about records it should not, or barely, own.
 *
 * The predicate itself is proved by the corpus in `packages/db`. This is the
 * other half: the gates around it. A record another organization owns, a
 * soft-deleted one and an unknown id all have to be indistinguishable, a region
 * another organization owns must never widen an answer. And `weather_sources`,
 * the only one of the fifteen whose `organization_id` is nullable, has to
 * answer with the caller's regions rather than with an empty list.
 *
 * One `withTestDb` for all seven cases. The harness applies the whole migration
 * set per call, so a block each would be seven migration runs and seven schemas
 * built at once alongside every other suite. Each case gets its own place on the
 * map instead, far enough from its neighbours that no region reaches two of them,
 * and every answer is read before anything is asserted so a failure names its
 * case rather than stopping the rest.
 */

const own = '00000000-0000-4000-8000-000000000601';
const other = '00000000-0000-4000-8000-000000000602';

const id = (n: number) => `00000000-0000-4000-8000-${String(600 + n).padStart(12, '0')}`;

/** One case's patch of the map. Ten degrees apart, and every region is one wide. */
const place = (lng: number) => ({ lng, lat: 35 });
const WHERE = {
	notFound: place(-40),
	nothingHolds: place(-30),
	scoping: place(-90),
	ordering: place(-80),
	selfExclusion: place(-70),
	sharedStation: place(-60),
	ownedStation: place(-50),
} as const;

const point = (at: { lng: number; lat: number }) =>
	sql<string>`st_setsrid(st_makepoint(${at.lng}, ${at.lat}), 4326)`;

/** A region covering one place and nothing else. Half a degree each way. */
const around = (at: { lng: number; lat: number }) =>
	sql<string>`st_makeenvelope(${at.lng - 0.5}, ${at.lat - 0.5}, ${at.lng + 0.5}, ${at.lat + 0.5}, 4326)`;

async function seed(db: DbExecutor): Promise<void> {
	await db
		.insertInto('organizations')
		.values([
			{ id: own, workos_organization_id: 'org_region_read_own', name: 'Own District' },
			{ id: other, workos_organization_id: 'org_region_read_other', name: 'Other District' },
		])
		.execute();

	await db
		.insertInto('region_folders')
		.values([
			{ id: id(40), organization_id: own, name: 'Zones' },
			{ id: id(41), organization_id: own, name: 'Districts' },
		])
		.execute();

	await db
		.insertInto('regions')
		.values([
			// Scoping: ours, theirs and a deleted one, all over the same place.
			{ id: id(30), organization_id: own, name: 'Ours', geom: around(WHERE.scoping) },
			{ id: id(31), organization_id: other, name: 'Theirs', geom: around(WHERE.scoping) },
			{
				id: id(32),
				organization_id: own,
				name: 'Deleted',
				geom: around(WHERE.scoping),
				deleted_at: new Date(),
			},
			// Ordering: two folders, two regions in one of them, and one unfiled.
			{
				id: id(42),
				organization_id: own,
				region_folder_id: id(40),
				name: 'Zone 3',
				geom: around(WHERE.ordering),
			},
			{
				id: id(43),
				organization_id: own,
				region_folder_id: id(41),
				name: 'North',
				geom: around(WHERE.ordering),
			},
			{
				id: id(44),
				organization_id: own,
				region_folder_id: id(41),
				name: 'Anvil',
				geom: around(WHERE.ordering),
			},
			{ id: id(45), organization_id: own, name: 'Pilot area', geom: around(WHERE.ordering) },
			// Self-exclusion: two regions with the identical boundary.
			{ id: id(50), organization_id: own, name: 'Subject', geom: around(WHERE.selfExclusion) },
			{ id: id(51), organization_id: own, name: 'Twin', geom: around(WHERE.selfExclusion) },
			// The two weather cases.
			{ id: id(60), organization_id: own, name: 'Station zone', geom: around(WHERE.sharedStation) },
			{ id: id(70), organization_id: own, name: 'Their zone', geom: around(WHERE.ownedStation) },
		])
		.execute();

	await db
		.insertInto('habitats')
		.values([
			{
				id: id(10),
				organization_id: other,
				geom: point(WHERE.notFound),
				description: 'other organization',
			},
			{
				id: id(11),
				organization_id: own,
				geom: point(WHERE.notFound),
				description: 'deleted',
				deleted_at: new Date(),
			},
			// Nowhere near a region, which is what makes its answer an empty one.
			{
				id: id(21),
				organization_id: own,
				geom: point(WHERE.nothingHolds),
				description: 'far away',
			},
			{ id: id(33), organization_id: own, geom: point(WHERE.scoping), description: 'scoping' },
			{ id: id(46), organization_id: own, geom: point(WHERE.ordering), description: 'ordering' },
		])
		.execute();

	await db
		.insertInto('weather_sources')
		.values([
			{
				id: id(61),
				organization_id: null,
				source_type: 'nws',
				source_name: 'Shared station',
				geom: point(WHERE.sharedStation),
			},
			{
				id: id(71),
				organization_id: other,
				source_type: 'organization',
				source_name: 'Their station',
				geom: point(WHERE.ownedStation),
			},
		])
		.execute();
}

describeDbIntegration('the regions-containing-a-record read', () => {
	it('gates every case the way the contract says', async () => {
		await withTestDb(async ({ db }) => {
			await seed(db);

			const read = (recordType: 'habitats' | 'regions' | 'weather_sources', recordId: string) =>
				readRecordRegions(db, { recordType, recordId, organizationId: own });

			const [
				otherOrganization,
				softDeleted,
				unknown,
				nothingHolds,
				scoping,
				ordering,
				selfExclusion,
				sharedStation,
				ownedStation,
			] = await Promise.all([
				read('habitats', id(10)),
				read('habitats', id(11)),
				read('habitats', id(12)),
				read('habitats', id(21)),
				read('habitats', id(33)),
				read('habitats', id(46)),
				read('regions', id(50)),
				read('weather_sources', id(61)),
				read('weather_sources', id(71)),
			]);

			// A record another organization owns, a soft-deleted one and an id that
			// never existed have to be indistinguishable. That is why `found` is a
			// body field and not a status code.
			expect({
				otherOrganization: summarize(otherOrganization),
				softDeleted: summarize(softDeleted),
				unknown: summarize(unknown),
			}).toEqual({
				otherOrganization: { found: false, groups: [] },
				softDeleted: { found: false, groups: [] },
				unknown: { found: false, groups: [] },
			});

			// The empty answer is a real answer, and it is not `found: false`. The
			// panel's copy hangs on the difference.
			expect(summarize(nothingHolds)).toEqual({ found: true, groups: [] });

			// Another organization's region never widens the answer, and a
			// soft-deleted one never appears.
			expect(scoping.groups).toEqual([
				{ folderId: null, folderName: null, regions: [{ id: id(30), name: 'Ours' }] },
			]);

			// Folders by name, regions by name inside them, unfiled last.
			expect(ordering.groups).toEqual([
				{
					folderId: id(41),
					folderName: 'Districts',
					regions: [
						{ id: id(44), name: 'Anvil' },
						{ id: id(43), name: 'North' },
					],
				},
				{ folderId: id(40), folderName: 'Zones', regions: [{ id: id(42), name: 'Zone 3' }] },
				{ folderId: null, folderName: null, regions: [{ id: id(45), name: 'Pilot area' }] },
			]);

			// The twin has the identical boundary, so `ST_Relate` matches it and
			// should: excluding the subject is an id filter, not a geometry one.
			expect(selfExclusion.groups).toEqual([
				{ folderId: null, folderName: null, regions: [{ id: id(51), name: 'Twin' }] },
			]);

			// `found: true` alone is not the assertion. A region set scoped to the
			// record's own column rather than the caller's answers `found: true` with
			// an empty `groups`, and the panel then reads "inside none of your
			// regions" on every shared station forever. The other fourteen tables
			// cannot expose either failure, so this is the only case that catches it.
			expect(sharedStation).toEqual({
				recordType: 'weather_sources',
				recordId: id(61),
				found: true,
				groups: [
					{ folderId: null, folderName: null, regions: [{ id: id(60), name: 'Station zone' }] },
				],
			});

			// The widened gate is for null, not for every value. A row another
			// organization owns is still invisible.
			expect(summarize(ownedStation)).toEqual({ found: false, groups: [] });
		});
	});
});

function summarize(answer: RecordRegions) {
	return { found: answer.found, groups: answer.groups };
}
