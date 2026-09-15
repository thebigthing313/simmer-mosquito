import { type Kysely, type SimmerDatabase, sql } from '@simmer-mosquito/db';
import {
	createActingOrganization,
	createInspection,
	describeDbIntegration,
	withTestDb,
} from '@simmer-mosquito/db/test-support';
import { expect, it } from 'vitest';
import { command, commandApp } from './support/command-app.js';

/**
 * The covers-ground rule where it meets HTTP.
 *
 * `packages/domain` proves the predicate and the paths it names. What only a
 * server and a database can answer is that the refusal comes back as a 400 and
 * that nothing was written, on both routes into a `geom` column: a geometry the
 * caller drew, and one inherited from a row they named by id.
 *
 * The inherited half is the one worth a database. It refuses inside the write
 * transaction, which answered 500 until `handleCommandError` grew a
 * `DomainValidationError` arm (#436), and the row it reads has to be a real one.
 */
describeDbIntegration('a geometry that covers no ground', () => {
	it('refuses a drawn polygon with no area, and writes no habitat', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId: org, actorProfileId: actor } = await createActingOrganization(db);

			const response = await commandApp(db, org, actor).request(
				'/commands/habitats',
				command('POST', ['larvalSurveillance.createHabitat'], {
					id: HABITAT_ID,
					description: 'Roadside ditch',
					locationSource: { kind: 'geometry', geometry: PINPRICK },
				}),
			);

			expect(response.status).toBe(400);
			// `reason` and not `message`, which is the shape every refusal answers
			// in since #928. The per-path `message` inside `issues` is a different
			// field and says what is wrong with that one path.
			await expect(response.json()).resolves.toMatchObject({
				error: 'invalid_command',
				reason: 'Create habitat command is invalid.',
				issues: [
					{
						path: 'locationSource.geometry.coordinates',
						message: 'locationSource.geometry.coordinates covers no ground.',
					},
				],
			});
			await expect(countHabitats(db, org)).resolves.toBe(0);
		});
	});

	/**
	 * The only layer that knows which record the geometry came from, so it is the
	 * only one that can say which row to go and fix. The degenerate inspection is
	 * seeded straight into the table, because no command can make one any more.
	 */
	it('refuses an inherited geometry with no area, and names the row it came from', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId: org, actorProfileId: actor } = await createActingOrganization(db);
			const inspectionId = await createDegenerateInspection(db, org);

			const response = await commandApp(db, org, actor).request(
				'/commands/habitats',
				command('POST', ['larvalSurveillance.createHabitat'], {
					id: HABITAT_ID,
					description: 'Roadside ditch',
					locationSource: { kind: 'inspection', inspectionId },
				}),
			);

			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toEqual({
				error: 'source_geometry_covers_no_ground',
				source: { table: 'inspections', id: inspectionId },
			});
			await expect(countHabitats(db, org)).resolves.toBe(0);
		});
	});

	it('takes the same shape once it has area', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId: org, actorProfileId: actor } = await createActingOrganization(db);

			const response = await commandApp(db, org, actor).request(
				'/commands/habitats',
				command('POST', ['larvalSurveillance.createHabitat'], {
					id: HABITAT_ID,
					description: 'Roadside ditch',
					locationSource: {
						kind: 'geometry',
						geometry: {
							type: 'Polygon',
							coordinates: [
								[
									[-90.5, 35.5],
									[-90.5, 35.6],
									[-90.4, 35.6],
									[-90.5, 35.5],
								],
							],
						},
					},
				}),
			);

			expect(response.status).toBe(201);
			await expect(countHabitats(db, org)).resolves.toBe(1);
		});
	});
});

type Db = Kysely<SimmerDatabase>;

const HABITAT_ID = '00000000-0000-4000-8000-0000000004a1';

/**
 * Closed, four positions, zero area.
 *
 * `ST_IsEmpty` is false for this, which is why the rule is a measure rather than
 * an emptiness test. PostGIS stores it after a notice nobody reads.
 */
const PINPRICK = {
	type: 'Polygon',
	coordinates: [
		[
			[-90.5, 35.5],
			[-90.5, 35.5],
			[-90.5, 35.5],
			[-90.5, 35.5],
		],
	],
};

/** An inspection already stored on a zero-area ring, which the rule has to find. */
function createDegenerateInspection(db: Db, organizationId: string): Promise<string> {
	return createInspection(db, organizationId, {
		geom: sql`st_setsrid(st_geomfromtext('POLYGON((-90.5 35.5, -90.5 35.5, -90.5 35.5, -90.5 35.5))'), 4326)`,
	});
}

async function countHabitats(db: Db, organizationId: string): Promise<number> {
	const rows = await db
		.selectFrom('habitats')
		.select(['id'])
		.where('organization_id', '=', organizationId)
		.execute();
	return rows.length;
}
