/**
 * The six creates `apps/admin` makes while standing an Organization up, against
 * a real database.
 *
 * These are the whole of the older per-domain write surface (#634), and they are
 * the one part of it a client still calls, so what they need is a happy path
 * rather than a shape check. `organization-seed-routes.test.ts` next door asserts
 * which paths exist and that the role floor answers first; this walks the
 * console's own order and reads each row back out of the table it landed in.
 *
 * The order is the console's, not a convenience: a trap names a collection
 * method and a lure, and a region names the folder it is filed under, so each
 * step here uses the id the step before it minted.
 *
 * The bodies are `camelCase`, unlike everything on `/commands/{table}`. That is
 * the surface these routes kept and the reason the payload readers in
 * `writers/foundation/shared.ts` still exist; see
 * `docs/domain-command-contract.md` on column names in a command body.
 */

import type { Kysely, SimmerDatabase } from '@simmer-mosquito/db';
import {
	createOrganization,
	createProfile,
	createSpecies,
	describeDbIntegration,
	withTestDb,
} from '@simmer-mosquito/db/test-support';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { expect, it } from 'vitest';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';
import { registerOrganizationSeedRoutes } from '../../organization-seed-routes.js';

const POINT = { type: 'Point', coordinates: [-90.5, 35.5] };
const POLYGON = {
	type: 'Polygon',
	coordinates: [
		[
			[-90.6, 35.4],
			[-90.4, 35.4],
			[-90.4, 35.6],
			[-90.6, 35.6],
			[-90.6, 35.4],
		],
	],
};

describeDbIntegration('the organization seed creates', () => {
	it('seeds an Organization the way the operator console does', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);
			const actorProfileId = await createProfile(db, organizationId);
			const speciesId = await createSpecies(db);
			const app = seedApp(db, organizationId, actorProfileId);

			const folderId = crypto.randomUUID();
			await expectCreated(
				app,
				'/foundation/region-folders',
				{ id: folderId, name: 'Northern district', description: null },
				'regionFolder',
			);

			const regionId = crypto.randomUUID();
			await expectCreated(
				app,
				'/foundation/regions',
				{
					id: regionId,
					name: 'Zone 1',
					regionFolderId: folderId,
					description: null,
					geometry: POLYGON,
				},
				'region',
			);

			const addressId = crypto.randomUUID();
			await expectCreated(
				app,
				'/foundation/addresses',
				{
					id: addressId,
					displayName: '100 Main St',
					country: 'US',
					addressLine1: '100 Main St',
					locality: 'Memphis',
					region: 'TN',
					postalCode: '38103',
					geojson: POINT,
				},
				'address',
			);

			await expectCreated(
				app,
				'/foundation/organization-species',
				{ id: crypto.randomUUID(), speciesId },
				'organizationSpecies',
			);

			const collectionMethodId = crypto.randomUUID();
			await expectCreated(
				app,
				'/foundation/collection-methods',
				{
					id: collectionMethodId,
					name: 'CDC light trap',
					description: 'Overnight trap',
					actionThreshold: 12,
				},
				'collectionMethod',
			);

			const collectionLureId = crypto.randomUUID();
			await expectCreated(
				app,
				'/foundation/collection-lures',
				{ id: collectionLureId, name: 'Dry ice', description: null },
				'collectionLure',
			);

			await expectCreated(
				app,
				'/foundation/habitat-types',
				{ id: crypto.randomUUID(), name: 'Roadside ditch', description: null },
				'habitatType',
			);

			const trapId = crypto.randomUUID();
			await expectCreated(
				app,
				'/adult-surveillance/traps',
				{
					id: trapId,
					locationSource: { kind: 'geometry', geometry: POINT },
					collectionMethodId,
					collectionLureId,
					addressId,
					trapName: 'NG-1',
					trapCode: 'NG-1',
					description: null,
				},
				'trap',
			);

			// Every row landed in the Organization the session named, and none of
			// them carried an id the body could have set: `organization_id` is
			// server-owned on all eight of these tables.
			expect(await organizationOf(db, 'region_folders', folderId)).toBe(organizationId);
			expect(await organizationOf(db, 'regions', regionId)).toBe(organizationId);
			expect(await organizationOf(db, 'addresses', addressId)).toBe(organizationId);
			expect(await organizationOf(db, 'collection_methods', collectionMethodId)).toBe(
				organizationId,
			);
			expect(await organizationOf(db, 'traps', trapId)).toBe(organizationId);

			// The trap kept the links the seeding order gave it. A trap that came
			// back 201 with a null method would read as a success and be unusable.
			const trap = await db
				.selectFrom('traps')
				.select(['collection_method_id', 'collection_lure_id', 'address_id', 'trap_code'])
				.where('id', '=', trapId)
				.executeTakeFirstOrThrow();
			expect(trap).toMatchObject({
				collection_method_id: collectionMethodId,
				collection_lure_id: collectionLureId,
				address_id: addressId,
				trap_code: 'NG-1',
			});
		});
	});

	it('refuses an invalid body before it writes anything', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);
			const actorProfileId = await createProfile(db, organizationId);
			const app = seedApp(db, organizationId, actorProfileId);

			// No name. The domain builder runs before the transaction opens, so the
			// refusal is a 400 naming the field rather than a constraint violation.
			const response = await app.request('/foundation/collection-methods', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: crypto.randomUUID(), description: 'Overnight trap' }),
			});

			expect(response.status).toBe(400);
			const rows = await db.selectFrom('collection_methods').select(['id']).execute();
			expect(rows).toHaveLength(0);
		});
	});
});

async function expectCreated(
	app: Hono<{ Variables: AuthVariables }>,
	path: string,
	body: Record<string, unknown>,
	key: string,
): Promise<void> {
	const response = await app.request(path, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});

	// The id and the txid together: the console reads the row back under `key`,
	// and the txid is what a caller waits on before it re-reads.
	const answered = (await response.json()) as Record<string, unknown>;
	expect({ path, status: response.status }).toEqual({ path, status: 201 });
	expect(answered[key]).toMatchObject({ id: body.id });
	expect(typeof answered.txid).toBe('number');
}

function organizationOf(
	db: Kysely<SimmerDatabase>,
	table: 'region_folders' | 'regions' | 'addresses' | 'collection_methods' | 'traps',
	id: string,
): Promise<string> {
	return db
		.selectFrom(table)
		.select(['organization_id'])
		.where('id', '=', id)
		.executeTakeFirstOrThrow()
		.then((row) => row.organization_id);
}

/**
 * The seed routes over a test database, with an Owner session.
 *
 * Owner because these suites are about what the writes do; the ladder is
 * asserted in `organization-seed-routes.test.ts`, which needs no database
 * because the floor answers before the transaction opens.
 */
function seedApp(
	db: Kysely<SimmerDatabase>,
	organizationId: string,
	profileId: string,
): Hono<{ Variables: AuthVariables }> {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerOrganizationSeedRoutes(app, {
		db,
		authContextMiddleware: createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
			context.set('authContext', {
				organization: { id: organizationId },
				profile: { id: profileId },
				role: 'owner',
			} as AuthContext);
			await next();
		}),
	});
	return app;
}
