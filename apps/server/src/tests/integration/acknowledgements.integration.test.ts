import { type Kysely, type SimmerDatabase, sql } from '@simmer-mosquito/db';
import {
	createAddress,
	createAssignment,
	createAssignmentItem,
	createCollection,
	createCollectionMethod,
	createCollectionSpecies,
	createContact,
	createFormulation,
	createHabitat,
	createInsecticide,
	createInsecticideBatch,
	createOrganization,
	createProfile,
	createRegion,
	createRegionFolder,
	createRoute,
	createRouteItem,
	createServiceRequest,
	createSpecies,
	createTrap,
	createUnit,
	describeDbIntegration,
	createFormulationInsecticide as insertFormulationInsecticide,
	withTestDb,
} from '@simmer-mosquito/db/test-support';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { expect, it } from 'vitest';
import { registerAdultSurveillanceCommandRoutes } from '../../adult-surveillance-commands/index.js';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';
import { registerControlOperationsCommandRoutes } from '../../control-operations-commands/index.js';
import { registerControlProductCommandRoutes } from '../../control-product-commands.js';
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
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const methodId = await createCollectionMethod(db, org);
			const trapId = await createTrap(db, org, methodId);
			const collectionId = await createCollection(
				db,
				org,
				{ trapId: trapId, collectionMethodId: methodId },
				{
					collected_at: sql`timestamptz '2026-08-02 06:00:00+00'`,
				},
			);
			const speciesId = await createSpecies(db);
			await createCollectionSpecies(db, org, { collectionId: collectionId, speciesId: speciesId });

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
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const methodId = await createCollectionMethod(db, org);
			const trapId = await createTrap(db, org, methodId);
			const collectionId = await createCollection(
				db,
				org,
				{ trapId: trapId, collectionMethodId: methodId },
				{
					collected_at: sql`timestamptz '2026-08-02 06:00:00+00'`,
				},
			);
			const speciesId = await createSpecies(db);
			await createCollectionSpecies(db, org, { collectionId: collectionId, speciesId: speciesId });

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
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const habitatId = await createHabitat(db, org);
			const routeId = await createRoute(db, org);
			const routeItemId = await createRouteItem(db, org, {
				routeId: routeId,
				entityType: 'habitat',
				entityId: habitatId,
			});

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
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const habitatId = await createHabitat(db, org);
			const routeId = await createRoute(db, org);
			const routeItemId = await createRouteItem(db, org, {
				routeId: routeId,
				entityType: 'habitat',
				entityId: habitatId,
			});

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
			const org = await createOrganization(db);
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
			const org = await createOrganization(db);
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
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const habitatId = await createHabitat(db, org);
			const assignmentId = await createAssignment(db, org);
			const stopId = await createAssignmentItem(db, org, {
				assignmentId: assignmentId,
				entityType: 'habitat',
				entityId: habitatId,
			});
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
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const habitatId = await createHabitat(db, org);
			const assignmentId = await createAssignment(db, org);
			const stopId = await createAssignmentItem(db, org, {
				assignmentId: assignmentId,
				entityType: 'habitat',
				entityId: habitatId,
			});
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
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const stopHabitatId = await createHabitat(db, org);
			const otherHabitatId = await createHabitat(db, org);
			const assignmentId = await createAssignment(db, org);
			const stopId = await createAssignmentItem(db, org, {
				assignmentId: assignmentId,
				entityType: 'habitat',
				entityId: stopHabitatId,
			});

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
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const stopHabitatId = await createHabitat(db, org);
			const otherHabitatId = await createHabitat(db, org);
			const assignmentId = await createAssignment(db, org);
			const stopId = await createAssignmentItem(db, org, {
				assignmentId: assignmentId,
				entityType: 'habitat',
				entityId: stopHabitatId,
			});

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
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const habitatId = await createHabitat(db, org);
			const assignmentId = await createAssignment(db, org);
			const stopId = await createAssignmentItem(db, org, {
				assignmentId: assignmentId,
				entityType: 'habitat',
				entityId: habitatId,
			});

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
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const folderId = await createRegionFolder(db, org);
			const regionId = await createRegion(db, org, { region_folder_id: folderId });

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
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const folderId = await createRegionFolder(db, org);
			const regionId = await createRegion(db, org, { region_folder_id: folderId });

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
			// Unfiled, not deleted. The regions are the organization's map; the
			// folder was only where they were kept.
			expect(region.region_folder_id).toBeNull();
			expect(region.deleted_at).toBeNull();
		});
	});

	// -----------------------------------------------------------------------
	// Deactivation: what a retirement takes with it, and what it leaves behind
	// -----------------------------------------------------------------------

	it('refuses retiring a product other records still use, counting both kinds, and writes nothing', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const unitId = await createUnit(db, {
				unit_name: 'gallon',
				abbreviation: 'gal',
				unit_type: 'volume',
				unit_system: 'imperial',
			});
			const insecticideId = await createInsecticide(db, org, unitId);
			await createInsecticideBatch(db, org, insecticideId);
			const formulationId = await createFormulation(db, org, unitId);
			await createFormulationInsecticide(db, org, formulationId, insecticideId, unitId);

			const response = await controlProductApp(db, org, actor).request(
				`/control-products/insecticides/${insecticideId}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						id: insecticideId,
						isActive: false,
						acknowledgedDependentDeactivation: false,
					}),
				},
			);

			expect(response.status).toBe(409);
			// Both kinds in one refusal. Confirming "1 batch" and then meeting the
			// formulation is the surprise the count is there to prevent.
			await expect(response.json()).resolves.toMatchObject({
				error: 'acknowledgement_required',
				flag: 'acknowledgedDependentDeactivation',
				consequences: [
					{ key: 'insecticideBatches', count: 1, singular: 'batch' },
					{ key: 'insecticideFormulations', count: 1, singular: 'formulation' },
				],
			});

			const insecticide = await db
				.selectFrom('insecticides')
				.select(['is_active'])
				.where('id', '=', insecticideId)
				.executeTakeFirstOrThrow();
			expect(insecticide.is_active).toBe(true);
		});
	});

	it('refuses removing the last ingredient of a formulation, with an empty consequences list', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const unitId = await createUnit(db, {
				unit_name: 'gallon',
				abbreviation: 'gal',
				unit_type: 'volume',
				unit_system: 'imperial',
			});
			const insecticideId = await createInsecticide(db, org, unitId);
			const formulationId = await createFormulation(db, org, unitId);
			const componentId = await createFormulationInsecticide(
				db,
				org,
				formulationId,
				insecticideId,
				unitId,
			);

			const response = await formulationApp(db, org, actor).request(
				`/control-operations/formulation-insecticides/${componentId}`,
				{
					method: 'DELETE',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ acknowledgedDeactivateEmptyFormulation: false }),
				},
			);

			expect(response.status).toBe(409);
			await expect(response.json()).resolves.toMatchObject({
				error: 'acknowledgement_required',
				flag: 'acknowledgedDeactivateEmptyFormulation',
				consequences: [],
			});

			const component = await db
				.selectFrom('formulation_insecticides')
				.select(['deleted_at'])
				.where('id', '=', componentId)
				.executeTakeFirstOrThrow();
			expect(component.deleted_at).toBeNull();
		});
	});

	it('deactivates the formulation once the organization confirms the recipe goes empty', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const unitId = await createUnit(db, {
				unit_name: 'gallon',
				abbreviation: 'gal',
				unit_type: 'volume',
				unit_system: 'imperial',
			});
			const insecticideId = await createInsecticide(db, org, unitId);
			const formulationId = await createFormulation(db, org, unitId);
			const componentId = await createFormulationInsecticide(
				db,
				org,
				formulationId,
				insecticideId,
				unitId,
			);

			const response = await formulationApp(db, org, actor).request(
				`/control-operations/formulation-insecticides/${componentId}`,
				{
					method: 'DELETE',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ acknowledgedDeactivateEmptyFormulation: true }),
				},
			);

			expect(response.status).toBe(200);
			// The flag is named for this half. An active recipe with nothing in it is
			// the state the confirmation was about, so the write does not leave one.
			const formulation = await db
				.selectFrom('formulations')
				.select(['is_active'])
				.where('id', '=', formulationId)
				.executeTakeFirstOrThrow();
			expect(formulation.is_active).toBe(false);
		});
	});

	it('takes the last ingredient out of a draft formulation without asking', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const unitId = await createUnit(db, {
				unit_name: 'gallon',
				abbreviation: 'gal',
				unit_type: 'volume',
				unit_system: 'imperial',
			});
			const insecticideId = await createInsecticide(db, org, unitId);
			const formulationId = await createFormulation(db, org, unitId);
			await db
				.updateTable('formulations')
				.set({ is_active: false })
				.where('id', '=', formulationId)
				.execute();
			const componentId = await createFormulationInsecticide(
				db,
				org,
				formulationId,
				insecticideId,
				unitId,
			);

			const response = await formulationApp(db, org, actor).request(
				`/control-operations/formulation-insecticides/${componentId}`,
				{ method: 'DELETE' },
			);

			// A draft with zero components is a state the domain allows on purpose,
			// so emptying one is not a question.
			expect(response.status).toBe(200);
		});
	});

	it('asks when the only other ingredient names a retired product', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const unitId = await createUnit(db, {
				unit_name: 'gallon',
				abbreviation: 'gal',
				unit_type: 'volume',
				unit_system: 'imperial',
			});
			const formulationId = await createFormulation(db, org, unitId);
			const liveId = await createFormulationInsecticide(
				db,
				org,
				formulationId,
				await createInsecticide(db, org, unitId, { trade_name: 'In use' }),
				unitId,
			);
			const retiredId = await createInsecticide(db, org, unitId, { trade_name: 'Retired' });
			await db
				.updateTable('insecticides')
				.set({ is_active: false })
				.where('id', '=', retiredId)
				.execute();
			await createFormulationInsecticide(db, org, formulationId, retiredId, unitId);

			const response = await formulationApp(db, org, actor).request(
				`/control-operations/formulation-insecticides/${liveId}`,
				{
					method: 'DELETE',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ acknowledgedDeactivateEmptyFormulation: false }),
				},
			);

			// Two rows are left behind, and neither can be mixed. Counting rows
			// rather than usable ingredients would let this through silently.
			expect(response.status).toBe(409);
			await expect(response.json()).resolves.toMatchObject({
				flag: 'acknowledgedDeactivateEmptyFormulation',
			});
		});
	});

	it('removes an ingredient the formulation is not down to, without asking', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const unitId = await createUnit(db, {
				unit_name: 'gallon',
				abbreviation: 'gal',
				unit_type: 'volume',
				unit_system: 'imperial',
			});
			const formulationId = await createFormulation(db, org, unitId);
			const firstId = await createFormulationInsecticide(
				db,
				org,
				formulationId,
				await createInsecticide(db, org, unitId, { trade_name: 'Product one' }),
				unitId,
			);
			await createFormulationInsecticide(
				db,
				org,
				formulationId,
				await createInsecticide(db, org, unitId, { trade_name: 'Product two' }),
				unitId,
			);

			const response = await formulationApp(db, org, actor).request(
				`/control-operations/formulation-insecticides/${firstId}`,
				{ method: 'DELETE' },
			);

			expect(response.status).toBe(200);
			const component = await db
				.selectFrom('formulation_insecticides')
				.select(['deleted_at'])
				.where('id', '=', firstId)
				.executeTakeFirstOrThrow();
			expect(component.deleted_at).not.toBeNull();
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

async function createOpenServiceRequest(db: Db, organizationId: string): Promise<string> {
	return createServiceRequest(db, organizationId, {
		addressId: await createAddress(db, organizationId),
		contactId: await createContact(db, organizationId),
	});
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

function controlProductApp(db: Db, organizationId: string, profileId: string) {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerControlProductCommandRoutes(app, {
		db,
		authContextMiddleware: authMiddleware(organizationId, profileId),
	});
	return app;
}

function formulationApp(db: Db, organizationId: string, profileId: string) {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerControlOperationsCommandRoutes(app, {
		db,
		authContextMiddleware: authMiddleware(organizationId, profileId),
	});
	return app;
}

function createFormulationInsecticide(
	db: Db,
	organizationId: string,
	formulationId: string,
	insecticideId: string,
	unitId: string,
): Promise<string> {
	return insertFormulationInsecticide(db, organizationId, {
		formulationId,
		insecticideId,
		unitId,
	});
}
