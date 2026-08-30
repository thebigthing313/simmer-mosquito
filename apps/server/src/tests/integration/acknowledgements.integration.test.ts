import { type Kysely, type SimmerDatabase, sql } from '@simmer-mosquito/db';
import { describeDbIntegration, withTestDb } from '@simmer-mosquito/db/test-support';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { expect, it } from 'vitest';
import { registerAdultSurveillanceCommandRoutes } from '../../adult-surveillance-commands/index.js';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';
import { registerFoundationGeographyCommandRoutes } from '../../foundation-geography-commands/index.js';
import { registerLarvalSurveillanceCommandRoutes } from '../../larval-surveillance-commands/index.js';
import { registerPublicEngagementRecordRoutes } from '../../public-engagement-records-commands/index.js';

/**
 * The three mechanisms outside the delete registry, refusing.
 *
 * Each case sends the flag as `false`, which is the only way to withhold one:
 * `acknowledged()` reads an absent flag as confirmed, deliberately, so that no
 * write a client makes today starts failing. Nothing in `apps/web` sends
 * `false` yet, and #319 is that half — which is exactly why these live here.
 * Without them the guards would be correct and unexercised, and would stay that
 * way until a form asked, by which point nobody would remember what the answer
 * was supposed to be.
 *
 * Every case also asserts the row is untouched. A refusal that has already
 * written half of what it was going to is worse than no refusal, and all three
 * mechanisms run before the first write for that reason.
 */
describeDbIntegration('acknowledgement refusals', () => {
	// -----------------------------------------------------------------------
	// Clearance: rows removed by a write that deletes no record
	// -----------------------------------------------------------------------

	it('refuses a zero-result mark that would drop species counts, and writes nothing', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'zero_result_withheld');
			const actor = await createProfile(db, org);
			const methodId = await createCollectionMethod(db, org);
			const trapId = await createTrap(db, org, methodId);
			const collectionId = await createCollection(db, org, trapId, methodId);
			const speciesId = await createSpecies(db);
			await createCollectionSpecies(db, org, collectionId, speciesId);

			const response = await collectionApp(db, org, actor).request(
				`/adult-surveillance/collections/${collectionId}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						isZeroResult: true,
						acknowledgedSpeciesCountsClearance: false,
					}),
				},
			);

			expect(response.status).toBe(409);
			await expect(response.json()).resolves.toMatchObject({
				error: 'acknowledgement_required',
				flag: 'acknowledgedSpeciesCountsClearance',
				consequences: [{ key: 'collectionSpeciesCounts', count: 1, singular: 'species count' }],
			});

			const collection = await db
				.selectFrom('collections')
				.select(['is_zero_result'])
				.where('id', '=', collectionId)
				.executeTakeFirstOrThrow();
			expect(collection.is_zero_result).toBe(false);

			const counts = await db
				.selectFrom('collection_species')
				.select(['deleted_at'])
				.where('collection_id', '=', collectionId)
				.executeTakeFirstOrThrow();
			expect(counts.deleted_at).toBeNull();
		});
	});

	it('marks zero result and clears the counts once the clearance is confirmed', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'zero_result_confirmed');
			const actor = await createProfile(db, org);
			const methodId = await createCollectionMethod(db, org);
			const trapId = await createTrap(db, org, methodId);
			const collectionId = await createCollection(db, org, trapId, methodId);
			const speciesId = await createSpecies(db);
			await createCollectionSpecies(db, org, collectionId, speciesId);

			const response = await collectionApp(db, org, actor).request(
				`/adult-surveillance/collections/${collectionId}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ isZeroResult: true }),
				},
			);

			expect(response.status).toBe(200);
			const counts = await db
				.selectFrom('collection_species')
				.select(['deleted_at'])
				.where('collection_id', '=', collectionId)
				.executeTakeFirstOrThrow();
			expect(counts.deleted_at).not.toBeNull();
		});
	});

	it('refuses a habitat retire that would take it off a route, and leaves it active', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'retire_withheld');
			const actor = await createProfile(db, org);
			const habitatId = await createHabitat(db, org);
			const routeId = await createRoute(db, org);
			const routeItemId = await createRouteItem(db, org, routeId, habitatId);

			const response = await habitatApp(db, org, actor).request(
				`/larval-surveillance/habitats/${habitatId}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ isActive: false, acknowledgedRouteRemoval: false }),
				},
			);

			expect(response.status).toBe(409);
			await expect(response.json()).resolves.toMatchObject({
				error: 'acknowledgement_required',
				flag: 'acknowledgedRouteRemoval',
				consequences: [{ key: 'habitatRouteItems', count: 1, singular: 'route stop' }],
			});

			const habitat = await db
				.selectFrom('habitats')
				.select(['is_active'])
				.where('id', '=', habitatId)
				.executeTakeFirstOrThrow();
			expect(habitat.is_active).toBe(true);

			const item = await db
				.selectFrom('route_items')
				.select(['deleted_at'])
				.where('id', '=', routeItemId)
				.executeTakeFirstOrThrow();
			expect(item.deleted_at).toBeNull();
		});
	});

	it('retires the habitat and takes it off the route once confirmed', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'retire_confirmed');
			const actor = await createProfile(db, org);
			const habitatId = await createHabitat(db, org);
			const routeId = await createRoute(db, org);
			const routeItemId = await createRouteItem(db, org, routeId, habitatId);

			const response = await habitatApp(db, org, actor).request(
				`/larval-surveillance/habitats/${habitatId}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ isActive: false }),
				},
			);

			expect(response.status).toBe(200);
			const item = await db
				.selectFrom('route_items')
				.select(['deleted_at'])
				.where('id', '=', routeItemId)
				.executeTakeFirstOrThrow();
			expect(item.deleted_at).not.toBeNull();
		});
	});

	// -----------------------------------------------------------------------
	// State: the record's own condition, counting nothing
	// -----------------------------------------------------------------------

	it('refuses deleting a closed request, with an empty consequences list', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'closed_request_withheld');
			const actor = await createProfile(db, org);
			const serviceRequestId = await createClosedServiceRequest(db, org, actor);

			const response = await serviceRequestApp(db, org, actor).request(
				`/public-engagement/service-requests/${serviceRequestId}`,
				{
					method: 'DELETE',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ acknowledgedClosedRequestDeletion: false }),
				},
			);

			expect(response.status).toBe(409);
			const body = (await response.json()) as {
				readonly error: string;
				readonly flag: string;
				readonly message: string;
				readonly consequences: readonly unknown[];
			};
			expect(body.error).toBe('acknowledgement_required');
			expect(body.flag).toBe('acknowledgedClosedRequestDeletion');
			// The settled shape for a state refusal: present and empty, not absent.
			// The client keys its sentence off `flag` and does not have to branch on
			// whether the field is there.
			expect(body.consequences).toEqual([]);
			expect(body.message).toContain('closed');

			const request = await db
				.selectFrom('service_requests')
				.select(['deleted_at'])
				.where('id', '=', serviceRequestId)
				.executeTakeFirstOrThrow();
			expect(request.deleted_at).toBeNull();
		});
	});

	it('does not ask about an open request', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'open_request');
			const actor = await createProfile(db, org);
			const serviceRequestId = await createOpenServiceRequest(db, org);

			const response = await serviceRequestApp(db, org, actor).request(
				`/public-engagement/service-requests/${serviceRequestId}`,
				{
					method: 'DELETE',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ acknowledgedClosedRequestDeletion: false }),
				},
			);

			expect(response.status).toBe(200);
		});
	});

	// -----------------------------------------------------------------------
	// Assignment execution: the stop's own state, one counted and one not
	// -----------------------------------------------------------------------

	it('refuses a second inspection on a completed stop, counting the first, and writes nothing', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'second_record_withheld');
			const actor = await createProfile(db, org);
			const habitatId = await createHabitat(db, org);
			const assignmentId = await createAssignment(db, org);
			const stopId = await createAssignmentItem(db, org, assignmentId, habitatId);
			const app = habitatApp(db, org, actor);

			// The stop is completed the ordinary way: by recording the work it was
			// created for. That is also what puts the first inspection on it.
			const first = await app.request('/larval-surveillance/inspections', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: crypto.randomUUID(),
					assignmentItemId: stopId,
					inspectionDate: '2026-08-05',
					isWet: false,
				}),
			});
			expect(first.status).toBe(201);

			const response = await app.request('/larval-surveillance/inspections', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: crypto.randomUUID(),
					assignmentItemId: stopId,
					inspectionDate: '2026-08-05',
					isWet: false,
					acknowledgedCompletedItemAdditionalRecord: false,
				}),
			});

			expect(response.status).toBe(409);
			await expect(response.json()).resolves.toMatchObject({
				error: 'acknowledgement_required',
				flag: 'acknowledgedCompletedItemAdditionalRecord',
				consequences: [{ key: 'stopInspections', count: 1, singular: 'inspection' }],
			});

			const inspections = await db
				.selectFrom('inspections')
				.select(['id'])
				.where('assignment_item_id', '=', stopId)
				.execute();
			expect(inspections).toHaveLength(1);
		});
	});

	it('records the second inspection once the double submit is confirmed', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'second_record_confirmed');
			const actor = await createProfile(db, org);
			const habitatId = await createHabitat(db, org);
			const assignmentId = await createAssignment(db, org);
			const stopId = await createAssignmentItem(db, org, assignmentId, habitatId);
			const app = habitatApp(db, org, actor);

			for (const acknowledgedSecondRecord of [false, true]) {
				const response = await app.request('/larval-surveillance/inspections', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						id: crypto.randomUUID(),
						assignmentItemId: stopId,
						inspectionDate: '2026-08-05',
						isWet: false,
						// The first of the two runs against a pending stop, where the
						// question does not arise however the flag is set.
						acknowledgedCompletedItemAdditionalRecord: acknowledgedSecondRecord,
					}),
				});
				expect(response.status).toBe(201);
			}

			const inspections = await db
				.selectFrom('inspections')
				.select(['id'])
				.where('assignment_item_id', '=', stopId)
				.execute();
			expect(inspections).toHaveLength(2);
		});
	});

	it('refuses an inspection of another habitat, with an empty consequences list', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'target_mismatch_withheld');
			const actor = await createProfile(db, org);
			const stopHabitatId = await createHabitat(db, org);
			const otherHabitatId = await createHabitat(db, org);
			const assignmentId = await createAssignment(db, org);
			const stopId = await createAssignmentItem(db, org, assignmentId, stopHabitatId);

			const response = await habitatApp(db, org, actor).request(
				'/larval-surveillance/inspections',
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						id: crypto.randomUUID(),
						assignmentItemId: stopId,
						habitatId: otherHabitatId,
						inspectionDate: '2026-08-05',
						isWet: false,
						acknowledgedTargetMismatch: false,
					}),
				},
			);

			expect(response.status).toBe(409);
			const body = (await response.json()) as {
				readonly error: string;
				readonly flag: string;
				readonly message: string;
				readonly consequences: readonly unknown[];
			};
			expect(body.error).toBe('acknowledgement_required');
			expect(body.flag).toBe('acknowledgedTargetMismatch');
			// A mismatch counts nothing, so the sentence is the whole answer.
			expect(body.consequences).toEqual([]);
			expect(body.message).toContain('habitat');

			const inspections = await db.selectFrom('inspections').select(['id']).execute();
			expect(inspections).toHaveLength(0);

			// Nothing was stamped on the way to the refusal either: the stop is still
			// pending and the assignment was not auto-started.
			const stop = await db
				.selectFrom('assignment_items')
				.select(['completed_at'])
				.where('id', '=', stopId)
				.executeTakeFirstOrThrow();
			expect(stop.completed_at).toBeNull();
			const assignment = await db
				.selectFrom('assignments')
				.select(['started_at'])
				.where('id', '=', assignmentId)
				.executeTakeFirstOrThrow();
			expect(assignment.started_at).toBeNull();
		});
	});

	it('records against the other habitat once the mismatch is confirmed', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'target_mismatch_confirmed');
			const actor = await createProfile(db, org);
			const stopHabitatId = await createHabitat(db, org);
			const otherHabitatId = await createHabitat(db, org);
			const assignmentId = await createAssignment(db, org);
			const stopId = await createAssignmentItem(db, org, assignmentId, stopHabitatId);

			const response = await habitatApp(db, org, actor).request(
				'/larval-surveillance/inspections',
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						id: crypto.randomUUID(),
						assignmentItemId: stopId,
						habitatId: otherHabitatId,
						inspectionDate: '2026-08-05',
						isWet: false,
						acknowledgedTargetMismatch: true,
					}),
				},
			);

			expect(response.status).toBe(201);
			const inspection = await db
				.selectFrom('inspections')
				.select(['habitat_id'])
				.executeTakeFirstOrThrow();
			expect(inspection.habitat_id).toBe(otherHabitatId);
		});
	});

	it('does not ask about the habitat the stop itself names', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'target_match');
			const actor = await createProfile(db, org);
			const habitatId = await createHabitat(db, org);
			const assignmentId = await createAssignment(db, org);
			const stopId = await createAssignmentItem(db, org, assignmentId, habitatId);

			const response = await habitatApp(db, org, actor).request(
				'/larval-surveillance/inspections',
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						id: crypto.randomUUID(),
						assignmentItemId: stopId,
						habitatId,
						inspectionDate: '2026-08-05',
						isWet: false,
						acknowledgedTargetMismatch: false,
					}),
				},
			);

			expect(response.status).toBe(201);
		});
	});

	// -----------------------------------------------------------------------
	// The registry, reaching a record it did not hold
	// -----------------------------------------------------------------------

	it('refuses deleting a region folder that still holds regions, and unfiles none', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'folder_withheld');
			const actor = await createProfile(db, org);
			const folderId = await createRegionFolder(db, org);
			const regionId = await createRegion(db, org, folderId);

			const response = await regionApp(db, org, actor).request(
				`/foundation/region-folders/${folderId}`,
				{
					method: 'DELETE',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ acknowledgedRegionDetach: false }),
				},
			);

			expect(response.status).toBe(409);
			await expect(response.json()).resolves.toMatchObject({
				error: 'acknowledgement_required',
				flag: 'acknowledgedRegionDetach',
				consequences: [{ key: 'folderRegions', count: 1, singular: 'region' }],
			});

			const region = await db
				.selectFrom('regions')
				.select(['region_folder_id'])
				.where('id', '=', regionId)
				.executeTakeFirstOrThrow();
			expect(region.region_folder_id).toBe(folderId);

			const folder = await db
				.selectFrom('region_folders')
				.select(['deleted_at'])
				.where('id', '=', folderId)
				.executeTakeFirstOrThrow();
			expect(folder.deleted_at).toBeNull();
		});
	});

	it('unfiles the regions once the detach is confirmed', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'folder_confirmed');
			const actor = await createProfile(db, org);
			const folderId = await createRegionFolder(db, org);
			const regionId = await createRegion(db, org, folderId);

			const response = await regionApp(db, org, actor).request(
				`/foundation/region-folders/${folderId}`,
				{ method: 'DELETE' },
			);

			expect(response.status).toBe(200);
			const region = await db
				.selectFrom('regions')
				.select(['region_folder_id', 'deleted_at'])
				.where('id', '=', regionId)
				.executeTakeFirstOrThrow();
			// Unfiled, not deleted. The regions are the agency's map; the folder was
			// only where they were kept.
			expect(region.region_folder_id).toBeNull();
			expect(region.deleted_at).toBeNull();
		});
	});
});

// ===========================================================================
// Apps
// ===========================================================================

type Db = Kysely<SimmerDatabase>;

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

function collectionApp(db: Db, organizationId: string, profileId: string) {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerAdultSurveillanceCommandRoutes(app, {
		db,
		authContextMiddleware: authMiddleware(organizationId, profileId),
	});
	return app;
}

function habitatApp(db: Db, organizationId: string, profileId: string) {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerLarvalSurveillanceCommandRoutes(app, {
		db,
		authContextMiddleware: authMiddleware(organizationId, profileId),
	});
	return app;
}

function serviceRequestApp(db: Db, organizationId: string, profileId: string) {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerPublicEngagementRecordRoutes(app, {
		db,
		authContextMiddleware: authMiddleware(organizationId, profileId),
	});
	return app;
}

function regionApp(db: Db, organizationId: string, profileId: string) {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerFoundationGeographyCommandRoutes(app, {
		db,
		authContextMiddleware: authMiddleware(organizationId, profileId),
	});
	return app;
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

async function createProfile(db: Db, organizationId: string): Promise<string> {
	const row = await db
		.insertInto('profiles')
		.values({ organization_id: organizationId, display_name: 'Technician' })
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
			collected_at: sql`timestamptz '2026-08-02 06:00:00+00'`,
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
async function createAssignment(db: Db, organizationId: string): Promise<string> {
	const row = await db
		.insertInto('assignments')
		.values({
			organization_id: organizationId,
			assignment_name: 'Thursday larval run',
			assignment_date: sql`date '2026-08-05'`,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createAssignmentItem(
	db: Db,
	organizationId: string,
	assignmentId: string,
	habitatId: string,
): Promise<string> {
	const row = await db
		.insertInto('assignment_items')
		.values({
			organization_id: organizationId,
			assignment_id: assignmentId,
			entity_type: 'habitat',
			entity_id: habitatId,
			position: 1,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createRoute(db: Db, organizationId: string): Promise<string> {
	const row = await db
		.insertInto('routes')
		.values({
			organization_id: organizationId,
			route_name: 'West larval run',
			route_type: 'habitat',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createRouteItem(
	db: Db,
	organizationId: string,
	routeId: string,
	habitatId: string,
): Promise<string> {
	const row = await db
		.insertInto('route_items')
		.values({
			organization_id: organizationId,
			route_id: routeId,
			entity_type: 'habitat',
			entity_id: habitatId,
			position: 1,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createAddress(db: Db, organizationId: string): Promise<string> {
	const row = await db
		.insertInto('addresses')
		.values({
			organization_id: organizationId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			display_name: '14 Levee Road',
			country: 'US',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createContact(db: Db, organizationId: string): Promise<string> {
	const row = await db
		.insertInto('contacts')
		.values({ organization_id: organizationId, contact_name: 'R. Alvarez' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createOpenServiceRequest(db: Db, organizationId: string): Promise<string> {
	const addressId = await createAddress(db, organizationId);
	const contactId = await createContact(db, organizationId);
	const row = await db
		.insertInto('service_requests')
		.values({
			organization_id: organizationId,
			intake_type: 'phone',
			request_date: sql`date '2026-08-01'`,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			address_id: addressId,
			contact_id: contactId,
			details: 'Standing water behind the levee.',
			metadata: null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createClosedServiceRequest(
	db: Db,
	organizationId: string,
	actorProfileId: string,
): Promise<string> {
	const serviceRequestId = await createOpenServiceRequest(db, organizationId);
	await db
		.updateTable('service_requests')
		.set({
			closed_at: sql`timestamptz '2026-08-05 12:00:00+00'`,
			closed_by_profile_id: actorProfileId,
		})
		.where('id', '=', serviceRequestId)
		.execute();
	return serviceRequestId;
}

async function createRegionFolder(db: Db, organizationId: string): Promise<string> {
	const row = await db
		.insertInto('region_folders')
		.values({ organization_id: organizationId, name: 'Zones' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createRegion(
	db: Db,
	organizationId: string,
	regionFolderId: string,
): Promise<string> {
	const row = await db
		.insertInto('regions')
		.values({
			organization_id: organizationId,
			region_folder_id: regionFolderId,
			geom: sql`st_setsrid(st_geomfromtext('POLYGON((-90.6 35.4, -90.4 35.4, -90.4 35.6, -90.6 35.6, -90.6 35.4))'), 4326)`,
			name: 'Zone 1',
			metadata: null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}
