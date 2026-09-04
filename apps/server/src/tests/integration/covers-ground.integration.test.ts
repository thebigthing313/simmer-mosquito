import { type Kysely, type SimmerDatabase, sql } from '@simmer-mosquito/db';
import { describeDbIntegration, withTestDb } from '@simmer-mosquito/db/test-support';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { expect, it } from 'vitest';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';
import { registerTableCommandRoutes } from '../../table-commands/dispatch.js';
import { habitatTableCommands } from '../../table-commands/habitats.js';

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
			const org = await createOrganization(db, 'drawn_pinprick');
			const actor = await createProfile(db, org);

			const response = await habitatApp(db, org, actor).request('/commands/habitats', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: HABITAT_ID,
					intents: ['larvalSurveillance.createHabitat'],
					description: 'Roadside ditch',
					locationSource: { kind: 'geometry', geometry: PINPRICK },
				}),
			});

			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toMatchObject({
				error: 'invalid_command',
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
			const org = await createOrganization(db, 'inherited_pinprick');
			const actor = await createProfile(db, org);
			const inspectionId = await createDegenerateInspection(db, org);

			const response = await habitatApp(db, org, actor).request('/commands/habitats', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: HABITAT_ID,
					intents: ['larvalSurveillance.createHabitat'],
					description: 'Roadside ditch',
					locationSource: { kind: 'inspection', inspectionId },
				}),
			});

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
			const org = await createOrganization(db, 'drawn_square');
			const actor = await createProfile(db, org);

			const response = await habitatApp(db, org, actor).request('/commands/habitats', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: HABITAT_ID,
					intents: ['larvalSurveillance.createHabitat'],
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
			});

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

function authMiddleware(organizationId: string, profileId: string) {
	return createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
		context.set('authContext', {
			organization: { id: organizationId },
			profile: { id: profileId },
			role: 'owner',
		} as AuthContext);
		await next();
	});
}

function habitatApp(db: Db, organizationId: string, profileId: string) {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerTableCommandRoutes(
		app,
		{ authContextMiddleware: authMiddleware(organizationId, profileId) },
		habitatTableCommands(db),
	);
	return app;
}

async function createOrganization(db: Db, slug: string): Promise<string> {
	const row = await db
		.insertInto('organizations')
		.values({ workos_organization_id: `workos_${slug}`, name: `${slug} District` })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createProfile(db: Db, organizationId: string): Promise<string> {
	const row = await db
		.insertInto('profiles')
		.values({ organization_id: organizationId, display_name: 'Technician' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createDegenerateInspection(db: Db, organizationId: string): Promise<string> {
	const row = await db
		.insertInto('inspections')
		.values({
			organization_id: organizationId,
			geom: sql`st_setsrid(st_geomfromtext('POLYGON((-90.5 35.5, -90.5 35.5, -90.5 35.5, -90.5 35.5))'), 4326)`,
			inspection_date: sql`date '2026-08-01'`,
			is_wet: true,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function countHabitats(db: Db, organizationId: string): Promise<number> {
	const rows = await db
		.selectFrom('habitats')
		.select(['id'])
		.where('organization_id', '=', organizationId)
		.execute();
	return rows.length;
}
