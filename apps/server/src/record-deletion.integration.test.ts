import { type Kysely, type SimmerDatabase, sql } from '@simmer-mosquito/db';
import { describeDbIntegration, withTestDb } from '@simmer-mosquito/db/test-support';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { expect, it } from 'vitest';
import { registerAdultSurveillanceCommandRoutes } from './adult-surveillance-commands/index.js';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';
import { registerRecordDeletionRoutes } from './record-deletion.js';

/**
 * The delete policy where it meets HTTP.
 *
 * `packages/db` proves what the policy does to rows. These are the two things
 * only the server can answer: what the impact endpoint tells a caller asking
 * about someone else's record, and what `cancelPendingCollection` — which
 * quietly gained the whole policy by sharing `softDeleteCollection` — actually
 * does when a pending collection is not as empty as expected.
 */
describeDbIntegration('record deletion at the HTTP boundary', () => {
	it('answers found: false for another agency’s record rather than 404', async () => {
		await withTestDb(async ({ db }) => {
			const owner = await createOrganization(db, 'impact_http_owner');
			const caller = await createOrganization(db, 'impact_http_caller');
			const habitatId = await createHabitat(db, owner);

			const response = await impactApp(db, caller).request(
				`/records/habitat/${habitatId}/delete-impact`,
			);

			// Deliberate, and the docstring on the route says so: a 404 here would
			// differ from the answer for an id that never existed, which turns the
			// endpoint into a way to probe for other agencies' ids.
			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toMatchObject({
				found: false,
				blockers: [],
				cascades: [],
				detaches: [],
			});
		});
	});

	it('answers the same shape for an id that never existed', async () => {
		await withTestDb(async ({ db }) => {
			const caller = await createOrganization(db, 'impact_http_missing');

			const response = await impactApp(db, caller).request(
				`/records/habitat/${NEVER_EXISTED}/delete-impact`,
			);

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toMatchObject({ found: false });
		});
	});

	// `softDeleteCollection` is shared by `deleteCollection` and
	// `cancelPendingCollection`, so cancelling took on the delete policy. For a
	// genuinely pending collection there is usually nothing to take — but nothing
	// pinned that, and `deleteCollection` carries an
	// `acknowledgedSpeciesCountDeletion` flag that the cancel path does not.
	it('applies the full delete policy when a pending collection is cancelled', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'cancel_policy');
			// A real profile: the delete stamps `deleted_by_profile_id` and
			// `updated_by_profile_id`, both of which carry a foreign key.
			const actor = await createProfile(db, org);
			const methodId = await createCollectionMethod(db, org);
			const trapId = await createTrap(db, org, methodId);
			const collectionId = await createCollection(db, org, trapId, methodId);
			const speciesId = await createSpecies(db);
			await createCollectionSpecies(db, org, collectionId, speciesId);
			await createComment(db, org, 'collection', collectionId);

			const response = await collectionApp(db, org, actor).request(
				`/adult-surveillance/collections/${collectionId}/cancel`,
				{ method: 'POST' },
			);
			expect(response.status).toBe(200);

			// Cancelling reaches the species count and the comment, with no
			// acknowledgement asked for. That is the documented intent, and it is
			// now pinned rather than assumed.
			const collection = await db
				.selectFrom('collections')
				.select(['deleted_at'])
				.where('id', '=', collectionId)
				.executeTakeFirstOrThrow();
			expect(collection.deleted_at).not.toBeNull();

			const speciesRow = await db
				.selectFrom('collection_species')
				.select(['deleted_at'])
				.where('collection_id', '=', collectionId)
				.executeTakeFirstOrThrow();
			expect(speciesRow.deleted_at).not.toBeNull();

			const comments = await db
				.selectFrom('comments')
				.select(['id'])
				.where('entity_id', '=', collectionId)
				.where('deleted_at', 'is', null)
				.execute();
			expect(comments).toEqual([]);
		});
	});
});

// ===========================================================================
// Apps
// ===========================================================================

type Db = Kysely<SimmerDatabase>;

const NEVER_EXISTED = 'b7c2f0a4-6f0e-4c39-9f1e-6a4a4b7c9d21';

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

function impactApp(db: Db, organizationId: string): Hono<{ Variables: AuthVariables }> {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerRecordDeletionRoutes(app, {
		db,
		authContextMiddleware: authMiddleware(organizationId, NEVER_EXISTED),
	});
	return app;
}

function collectionApp(
	db: Db,
	organizationId: string,
	profileId: string,
): Hono<{ Variables: AuthVariables }> {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerAdultSurveillanceCommandRoutes(app, {
		db,
		authContextMiddleware: authMiddleware(organizationId, profileId),
	});
	return app;
}

async function createProfile(db: Db, organizationId: string): Promise<string> {
	const row = await db
		.insertInto('profiles')
		.values({ organization_id: organizationId, display_name: 'Technician' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

// ===========================================================================
// Fixtures
// ===========================================================================

async function createOrganization(db: Db, slug: string): Promise<string> {
	const row = await db
		.insertInto('organizations')
		.values({ workos_organization_id: `workos_${slug}`, name: `${slug} District` })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createHabitat(db: Db, organizationId: string): Promise<string> {
	const row = await db
		.insertInto('habitats')
		.values({
			organization_id: organizationId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			habitat_name: 'Ditch',
			description: 'Roadside ditch',
			metadata: null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createCollectionMethod(db: Db, organizationId: string): Promise<string> {
	const row = await db
		.insertInto('collection_methods')
		.values({ organization_id: organizationId, name: 'CDC light trap' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createTrap(
	db: Db,
	organizationId: string,
	collectionMethodId: string,
): Promise<string> {
	const row = await db
		.insertInto('traps')
		.values({
			organization_id: organizationId,
			collection_method_id: collectionMethodId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			trap_name: 'North gate',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createCollection(
	db: Db,
	organizationId: string,
	trapId: string,
	collectionMethodId: string,
): Promise<string> {
	const row = await db
		.insertInto('collections')
		.values({
			organization_id: organizationId,
			trap_id: trapId,
			collection_method_id: collectionMethodId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			collection_timing_mode: 'exact_timestamps',
			started_at: sql`timestamptz '2026-08-01 06:00:00+00'`,
			metadata: null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createSpecies(db: Db): Promise<string> {
	const genus = await db
		.insertInto('genera')
		.values({ abbreviation: 'Cx', name: 'Culex' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	const row = await db
		.insertInto('species')
		.values({ genus_id: genus.id, epithet: 'pipiens', display_name: 'Culex pipiens' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createCollectionSpecies(
	db: Db,
	organizationId: string,
	collectionId: string,
	speciesId: string,
): Promise<string> {
	const row = await db
		.insertInto('collection_species')
		.values({
			organization_id: organizationId,
			collection_id: collectionId,
			species_id: speciesId,
			count: 12,
			identified_date: sql`date '2026-08-02'`,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createComment(
	db: Db,
	organizationId: string,
	entityType: string,
	entityId: string,
): Promise<string> {
	const row = await db
		.insertInto('comments')
		.values({
			organization_id: organizationId,
			entity_type: entityType,
			entity_id: entityId,
			comment_text: 'Note',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}
