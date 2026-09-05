import { type Kysely, type SimmerDatabase, sql } from '@simmer-mosquito/db';
import { describeDbIntegration, withTestDb } from '@simmer-mosquito/db/test-support';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { expect, it } from 'vitest';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';
import { registerRecordMergeReadRoutes } from '../../record-merge-reads.js';

/**
 * The merge read over real rows.
 *
 * The unit test covers what it refuses before querying. What only a database
 * can answer is whether the organization filter is actually threaded from the
 * auth context into the read. It takes an organization id as an argument, which
 * is the kind of thing that compiles perfectly while carrying the wrong value,
 * and a duplicate proposal naming another organization's row leads to a merge
 * the writer refuses with an id the user cannot see.
 */
describeDbIntegration('merge reads at the HTTP boundary', () => {
	it('proposes duplicates from the calling organization and no other', async () => {
		await withTestDb(async ({ db }) => {
			const caller = await createOrganization(db, 'merge_read_caller');
			const other = await createOrganization(db, 'merge_read_other');
			const mine = await createAddress(db, caller, 'Depot');
			const alsoMine = await createAddress(db, caller, 'depot');
			await createAddress(db, other, 'Depot');
			await createAddress(db, other, 'depot');

			const response = await mergeApp(db, caller).request('/records/address/duplicates');

			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				readonly groups: readonly { readonly records: readonly { readonly id: string }[] }[];
			};
			expect(body.groups).toHaveLength(1);
			expect(new Set(body.groups[0]?.records.map((record) => record.id))).toEqual(
				new Set([mine, alsoMine]),
			);
		});
	});

	it('answers nearby habitats for the calling organization, and 404 for anyone else', async () => {
		// The organization id is threaded from the auth context into the read,
		// which is the kind of thing that compiles perfectly while carrying the
		// wrong value. A 404 rather than an empty list, so the endpoint cannot be
		// used to probe for a habitat another organization owns.
		await withTestDb(async ({ db }) => {
			const caller = await createOrganization(db, 'nearby_route_caller');
			const other = await createOrganization(db, 'nearby_route_other');
			const home = await createHabitatAt(db, caller, 'Catch basin 41', -90.5, 35.5);
			const near = await createHabitatAt(db, caller, 'CB-41', -90.5, 35.5005);
			await createHabitatAt(db, other, 'Someone else basin', -90.5, 35.5005);

			const mine = await mergeApp(db, caller).request(
				`/records/habitat/${home}/nearby?radiusMetres=1000`,
			);
			const theirs = await mergeApp(db, other).request(
				`/records/habitat/${home}/nearby?radiusMetres=1000`,
			);

			expect(mine.status).toBe(200);
			await expect(mine.json()).resolves.toMatchObject({
				target: { id: home },
				candidates: [{ id: near }],
			});
			expect(theirs.status).toBe(404);
		});
	});

	it('runs the organization default radius when the caller names none', async () => {
		// The seeded default distance unit is `mile`, which reads as imperial, so
		// the first step is 250 ft. A habitat 100 m out is past that and one 50 m
		// out is inside it.
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'nearby_route_default');
			const home = await createHabitatAt(db, org, 'Culvert', -90.5, 35.5);
			const inside = await createHabitatAt(db, org, 'Culvert (dup)', -90.5, 35.50045);
			await createHabitatAt(db, org, 'Culvert, far end', -90.5, 35.5009);

			const response = await mergeApp(db, org).request(`/records/habitat/${home}/nearby`);

			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				readonly candidates: readonly { readonly id: string }[];
			};
			expect(body.candidates.map((candidate) => candidate.id)).toEqual([inside]);
		});
	});
});

type Db = Kysely<SimmerDatabase>;

function mergeApp(db: Db, organizationId: string): Hono<{ Variables: AuthVariables }> {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerRecordMergeReadRoutes(app, {
		db,
		authContextMiddleware: createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
			context.set('authContext', {
				organization: { id: organizationId },
				role: 'manager',
			} as AuthContext);
			await next();
		}),
	});
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

async function createAddress(db: Db, organizationId: string, displayName: string): Promise<string> {
	const row = await db
		.insertInto('addresses')
		.values({
			organization_id: organizationId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			display_name: displayName,
			country: 'US',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createHabitatAt(
	db: Db,
	organizationId: string,
	habitatName: string,
	lng: number,
	lat: number,
): Promise<string> {
	const row = await db
		.insertInto('habitats')
		.values({
			organization_id: organizationId,
			address_id: null,
			geom: sql`st_setsrid(st_makepoint(${lng}, ${lat}), 4326)`,
			habitat_name: habitatName,
			description: 'Roadside ditch',
			metadata: null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}
