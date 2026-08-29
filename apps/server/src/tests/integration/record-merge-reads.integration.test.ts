import { type Kysely, type SimmerDatabase, sql } from '@simmer-mosquito/db';
import { describeDbIntegration, withTestDb } from '@simmer-mosquito/db/test-support';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { expect, it } from 'vitest';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';
import { registerRecordMergeReadRoutes } from '../../record-merge-reads.js';

/**
 * The two merge reads over real rows.
 *
 * The unit test covers what they refuse before querying. What only a database
 * can answer is whether the agency filter is actually threaded from the auth
 * context into both reads. Both take an organization id as an argument, which is
 * the kind of thing that compiles perfectly while carrying the wrong value, and
 * a duplicate proposal naming another agency's row leads to a merge the writer
 * refuses with an id the user cannot see.
 */
describeDbIntegration('merge reads at the HTTP boundary', () => {
	it('proposes duplicates from the calling agency and no other', async () => {
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

	it('counts what a merge would move, from the rules the write uses', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'merge_read_impact');
			const target = await createAddress(db, org, 'Depot');
			const source = await createAddress(db, org, 'Depot (dup)');
			await createHabitat(db, org, source);
			await createHabitat(db, org, source);

			const response = await mergeApp(db, org).request(
				`/records/address/${target}/merge-impact?source=${source}`,
			);

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toMatchObject({
				recordType: 'address',
				targetId: target,
				sourceIds: [source],
				moves: [{ key: 'addressHabitats', moved: 2, deduped: 0 }],
			});
		});
	});

	it('counts nothing for records another agency owns, rather than reporting their rows', async () => {
		await withTestDb(async ({ db }) => {
			const owner = await createOrganization(db, 'merge_read_owner');
			const caller = await createOrganization(db, 'merge_read_stranger');
			const target = await createAddress(db, owner, 'Depot');
			const source = await createAddress(db, owner, 'Depot (dup)');
			await createHabitat(db, owner, source);

			const response = await mergeApp(db, caller).request(
				`/records/address/${target}/merge-impact?source=${source}`,
			);

			// Zero moves, not a 404: the same answer as a pair of ids that never
			// existed, so the endpoint cannot be used to probe for another agency's
			// records. The merge command itself refuses these ids outright.
			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toMatchObject({ moves: [] });
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

async function createHabitat(db: Db, organizationId: string, addressId: string): Promise<string> {
	const row = await db
		.insertInto('habitats')
		.values({
			organization_id: organizationId,
			address_id: addressId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			habitat_name: 'Ditch',
			description: 'Roadside ditch',
			metadata: null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}
