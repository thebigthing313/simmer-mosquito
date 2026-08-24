import { type DbExecutor, readRecordRegions, sql } from '@simmer-mosquito/db';
import { describeDbIntegration, withTestDb } from '@simmer-mosquito/db/test-support';
import { expect, it } from 'vitest';

/**
 * What the regions read answers about records it should not, or barely, own.
 *
 * The predicate itself is proved by the corpus in `packages/db`. This is the
 * other half: the gates around it. A record another agency owns, a soft-deleted
 * one and an unknown id all have to be indistinguishable, a region another agency
 * owns must never widen an answer. And `weather_sources`, the only one of the
 * fifteen whose `organization_id` is nullable, has to answer with the caller's
 * regions rather than with an empty list.
 */

const own = '00000000-0000-4000-8000-000000000601';
const other = '00000000-0000-4000-8000-000000000602';

/** A square covering everything the seeds place, so containment is never in doubt. */
const coveringRegion = sql<string>`st_makeenvelope(-91, 34, -89, 36, 4326)`;
const somewhere = sql<string>`st_setsrid(st_makepoint(-90, 35), 4326)`;
/** Far outside every seeded region, for the case that must find nothing. */
const elsewhere = sql<string>`st_setsrid(st_makepoint(-70, 25), 4326)`;

const id = (n: number) => `00000000-0000-4000-8000-${String(600 + n).padStart(12, '0')}`;

async function seedAgencies(db: DbExecutor): Promise<void> {
	await db
		.insertInto('organizations')
		.values([
			{ id: own, workos_organization_id: 'org_region_read_own', name: 'Own District' },
			{ id: other, workos_organization_id: 'org_region_read_other', name: 'Other District' },
		])
		.execute();
}

describeDbIntegration('the regions-containing-a-record read', () => {
	it('cannot tell a missing record from another agency’s or a deleted one', async () => {
		await withTestDb(async ({ db }) => {
			await seedAgencies(db);
			await db
				.insertInto('habitats')
				.values([
					{ id: id(10), organization_id: other, geom: somewhere, description: 'other agency' },
					{
						id: id(11),
						organization_id: own,
						geom: somewhere,
						description: 'deleted',
						deleted_at: new Date(),
					},
				])
				.execute();

			const answers = await Promise.all(
				[id(10), id(11), id(12)].map((recordId) =>
					readRecordRegions(db, { recordType: 'habitats', recordId, organizationId: own }),
				),
			);

			expect(answers.map((answer) => answer.found)).toEqual([false, false, false]);
			expect(answers.map((answer) => answer.groups)).toEqual([[], [], []]);
		});
	});

	it('answers found with no groups for a record inside nothing', async () => {
		await withTestDb(async ({ db }) => {
			await seedAgencies(db);
			await db
				.insertInto('regions')
				.values({ id: id(20), organization_id: own, name: 'District', geom: coveringRegion })
				.execute();
			await db
				.insertInto('habitats')
				.values({ id: id(21), organization_id: own, geom: elsewhere, description: 'far away' })
				.execute();

			const answer = await readRecordRegions(db, {
				recordType: 'habitats',
				recordId: id(21),
				organizationId: own,
			});

			// The empty answer is a real answer, and it is not `found: false`. The
			// panel's copy hangs on the difference.
			expect(answer).toMatchObject({ found: true, groups: [] });
		});
	});

	it('never lets another agency’s region into the answer', async () => {
		await withTestDb(async ({ db }) => {
			await seedAgencies(db);
			await db
				.insertInto('regions')
				.values([
					{ id: id(30), organization_id: own, name: 'Ours', geom: coveringRegion },
					{ id: id(31), organization_id: other, name: 'Theirs', geom: coveringRegion },
					{
						id: id(32),
						organization_id: own,
						name: 'Deleted',
						geom: coveringRegion,
						deleted_at: new Date(),
					},
				])
				.execute();
			await db
				.insertInto('habitats')
				.values({ id: id(33), organization_id: own, geom: somewhere, description: 'inside' })
				.execute();

			const answer = await readRecordRegions(db, {
				recordType: 'habitats',
				recordId: id(33),
				organizationId: own,
			});

			expect(answer.groups).toEqual([
				{ folderId: null, folderName: null, regions: [{ id: id(30), name: 'Ours' }] },
			]);
		});
	});

	it('orders folders by name and puts the unfiled group last', async () => {
		await withTestDb(async ({ db }) => {
			await seedAgencies(db);
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
					{
						id: id(42),
						organization_id: own,
						region_folder_id: id(40),
						name: 'Zone 3',
						geom: coveringRegion,
					},
					{
						id: id(43),
						organization_id: own,
						region_folder_id: id(41),
						name: 'North',
						geom: coveringRegion,
					},
					{
						id: id(44),
						organization_id: own,
						region_folder_id: id(41),
						name: 'Anvil',
						geom: coveringRegion,
					},
					{ id: id(45), organization_id: own, name: 'Pilot area', geom: coveringRegion },
				])
				.execute();
			await db
				.insertInto('habitats')
				.values({ id: id(46), organization_id: own, geom: somewhere, description: 'inside all' })
				.execute();

			const answer = await readRecordRegions(db, {
				recordType: 'habitats',
				recordId: id(46),
				organizationId: own,
			});

			expect(answer.groups).toEqual([
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
		});
	});

	it('leaves a region out of its own answer and keeps its overlapping sibling', async () => {
		await withTestDb(async ({ db }) => {
			await seedAgencies(db);
			await db
				.insertInto('regions')
				.values([
					{ id: id(50), organization_id: own, name: 'Subject', geom: coveringRegion },
					{ id: id(51), organization_id: own, name: 'Twin', geom: coveringRegion },
				])
				.execute();

			const answer = await readRecordRegions(db, {
				recordType: 'regions',
				recordId: id(50),
				organizationId: own,
			});

			// The twin has the identical boundary, so `ST_Relate` matches it and
			// should: excluding the subject is an id filter, not a geometry one.
			expect(answer.groups).toEqual([
				{ folderId: null, folderName: null, regions: [{ id: id(51), name: 'Twin' }] },
			]);
		});
	});

	it('answers a shared weather station with the caller’s own regions', async () => {
		await withTestDb(async ({ db }) => {
			await seedAgencies(db);
			await db
				.insertInto('regions')
				.values({ id: id(60), organization_id: own, name: 'Ours', geom: coveringRegion })
				.execute();
			await db
				.insertInto('weather_sources')
				.values({
					id: id(61),
					organization_id: null,
					source_type: 'nws',
					source_name: 'Shared station',
					geom: somewhere,
				})
				.execute();

			const answer = await readRecordRegions(db, {
				recordType: 'weather_sources',
				recordId: id(61),
				organizationId: own,
			});

			// `found: true` alone is not the assertion. A region set scoped to the
			// record's own column rather than the caller's answers `found: true` with
			// an empty `groups`, and the panel then reads "inside none of your
			// regions" on every shared station forever. The other fourteen tables
			// cannot expose either failure, so this is the only case that catches it.
			expect(answer).toEqual({
				recordType: 'weather_sources',
				recordId: id(61),
				found: true,
				groups: [{ folderId: null, folderName: null, regions: [{ id: id(60), name: 'Ours' }] }],
			});
		});
	});

	it('still hides another agency’s owned weather station', async () => {
		await withTestDb(async ({ db }) => {
			await seedAgencies(db);
			await db
				.insertInto('weather_sources')
				.values({
					id: id(70),
					organization_id: other,
					source_type: 'organization',
					source_name: 'Their station',
					geom: somewhere,
				})
				.execute();

			const answer = await readRecordRegions(db, {
				recordType: 'weather_sources',
				recordId: id(70),
				organizationId: own,
			});

			// The widened gate is for null, not for every value. A row another agency
			// owns is still invisible.
			expect(answer.found).toBe(false);
		});
	});
});
