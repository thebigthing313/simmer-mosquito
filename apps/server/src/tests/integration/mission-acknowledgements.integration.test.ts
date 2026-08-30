import { type Kysely, type SimmerDatabase, sql } from '@simmer-mosquito/db';
import { describeDbIntegration, withTestDb } from '@simmer-mosquito/db/test-support';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { expect, it } from 'vitest';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';
import { registerMissionDispatchCommandRoutes } from '../../mission-dispatch-commands/index.js';

/**
 * The mission acknowledgements that turn on state, refusing.
 *
 * Every case sends the flag as `false`, which is the only way to withhold one:
 * `acknowledged()` reads an absent flag as confirmed, deliberately, so that no
 * write a client makes today starts failing. Nothing in `apps/web` sends `false`
 * yet and #319 is that half, so without these the guards would be correct and
 * unexercised.
 *
 * Each case also asserts the mission or the stop is untouched, and each group
 * has one case where the state does not hold and the same withheld flag lets
 * the write through — which is what proves the guard is reading the mission
 * rather than the flag.
 */
describeDbIntegration('mission acknowledgement refusals', () => {
	// -----------------------------------------------------------------------
	// In progress
	// -----------------------------------------------------------------------

	it('refuses adding a stop to a mission in progress, and adds none', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'stop_added_in_progress');
			const actor = await createProfile(db, org);
			const missionId = await createMission(db, org, { startedAt: '2026-08-10 08:00:00+00' });

			const response = await missionApp(db, org, actor).request('/mission-dispatch/mission-items', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: crypto.randomUUID(),
					missionId,
					geometry: { type: 'Point', coordinates: [-90.5, 35.5] },
					acknowledgedInProgressMissionChange: false,
				}),
			});

			await expectStateRefusal(response, 'acknowledgedInProgressMissionChange', 'in progress');
			expect(await countStops(db, missionId)).toBe(0);
		});
	});

	it('adds the stop when the mission has not been started', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'stop_added_scheduled');
			const actor = await createProfile(db, org);
			const missionId = await createMission(db, org, {});

			const response = await missionApp(db, org, actor).request('/mission-dispatch/mission-items', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: crypto.randomUUID(),
					missionId,
					geometry: { type: 'Point', coordinates: [-90.5, 35.5] },
					acknowledgedInProgressMissionChange: false,
				}),
			});

			expect(response.status).toBe(201);
			expect(await countStops(db, missionId)).toBe(1);
		});
	});

	it('refuses reassigning a mission in progress, and leaves the assignee', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'reassign_in_progress');
			const actor = await createProfile(db, org);
			const crew = await createProfile(db, org);
			const missionId = await createMission(db, org, {
				startedAt: '2026-08-10 08:00:00+00',
				assignedToProfileId: crew,
			});

			const response = await missionApp(db, org, actor).request(
				`/mission-dispatch/missions/${missionId}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						assignedToProfileId: actor,
						acknowledgedInProgressAssignmentChange: false,
					}),
				},
			);

			await expectStateRefusal(response, 'acknowledgedInProgressAssignmentChange', 'in progress');
			const mission = await readMission(db, missionId);
			expect(mission.assigned_to_profile_id).toBe(crew);
		});
	});

	// -----------------------------------------------------------------------
	// Worked
	// -----------------------------------------------------------------------

	it('refuses moving the schedule of a mission that has been worked, and moves nothing', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'schedule_worked');
			const actor = await createProfile(db, org);
			const missionId = await createMission(db, org, {});
			const stopId = await createStop(db, org, missionId, 0);
			await createSourceReduction(db, org, stopId);

			const response = await missionApp(db, org, actor).request(
				`/mission-dispatch/missions/${missionId}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						scheduledStartAt: '2026-09-01T08:00:00.000Z',
						acknowledgedWorkedMissionScheduleChange: false,
					}),
				},
			);

			await expectStateRefusal(response, 'acknowledgedWorkedMissionScheduleChange', 'recorded');
			const mission = await readMission(db, missionId);
			expect(mission.scheduled_start_at.toISOString()).toBe('2026-08-10T08:00:00.000Z');
		});
	});

	it('moves the schedule of a mission nobody has recorded work against', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'schedule_unworked');
			const actor = await createProfile(db, org);
			const missionId = await createMission(db, org, {});
			await createStop(db, org, missionId, 0);

			const response = await missionApp(db, org, actor).request(
				`/mission-dispatch/missions/${missionId}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						scheduledStartAt: '2026-09-01T08:00:00.000Z',
						acknowledgedWorkedMissionScheduleChange: false,
					}),
				},
			);

			expect(response.status).toBe(200);
			const mission = await readMission(db, missionId);
			expect(mission.scheduled_start_at.toISOString()).toBe('2026-09-01T08:00:00.000Z');
		});
	});

	it('refuses changing the plan of a mission that has been worked', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'plan_worked');
			const actor = await createProfile(db, org);
			const missionId = await createMission(db, org, {});
			const stopId = await createStop(db, org, missionId, 0);
			await createSourceReduction(db, org, stopId);
			const methodId = await createSourceReductionMethod(db, org, 'Culvert clearing');

			const response = await missionApp(db, org, actor).request(
				`/mission-dispatch/missions/${missionId}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						plannedMethodId: methodId,
						acknowledgedWorkedMissionPlanChange: false,
					}),
				},
			);

			await expectStateRefusal(response, 'acknowledgedWorkedMissionPlanChange', 'recorded');
			const mission = await readMission(db, missionId);
			expect(mission.planned_method_id).toBeNull();
		});
	});

	// -----------------------------------------------------------------------
	// Cancellation
	// -----------------------------------------------------------------------

	it('refuses cancelling a mission whose stops have been handled', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'cancel_progressed');
			const actor = await createProfile(db, org);
			const missionId = await createMission(db, org, { startedAt: '2026-08-10 08:00:00+00' });
			await createStop(db, org, missionId, 0, { completedAt: '2026-08-10 09:00:00+00' });

			const response = await missionApp(db, org, actor).request(
				`/mission-dispatch/missions/${missionId}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						cancelledAt: '2026-08-11T08:00:00.000Z',
						cancellationReason: 'Rained off',
						acknowledgedProgressedMissionCancellation: false,
					}),
				},
			);

			await expectStateRefusal(
				response,
				'acknowledgedProgressedMissionCancellation',
				'completed or skipped',
			);
			const mission = await readMission(db, missionId);
			expect(mission.cancelled_at).toBeNull();
			expect(await countComments(db, missionId)).toBe(0);
		});
	});

	it('refuses cancelling a mission that has work recorded on it', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'cancel_partial_work');
			const actor = await createProfile(db, org);
			const missionId = await createMission(db, org, { startedAt: '2026-08-10 08:00:00+00' });
			const stopId = await createStop(db, org, missionId, 0);
			await createSourceReduction(db, org, stopId);

			const response = await missionApp(db, org, actor).request(
				`/mission-dispatch/missions/${missionId}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						cancelledAt: '2026-08-11T08:00:00.000Z',
						cancellationReason: 'Rained off',
						acknowledgedPartialWorkCancellation: false,
					}),
				},
			);

			await expectStateRefusal(response, 'acknowledgedPartialWorkCancellation', 'carried out');
			const mission = await readMission(db, missionId);
			expect(mission.cancelled_at).toBeNull();
		});
	});

	it('cancels a mission nobody has started work on, both flags withheld', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'cancel_untouched');
			const actor = await createProfile(db, org);
			const missionId = await createMission(db, org, {});
			await createStop(db, org, missionId, 0);

			const response = await missionApp(db, org, actor).request(
				`/mission-dispatch/missions/${missionId}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						cancelledAt: '2026-08-11T08:00:00.000Z',
						cancellationReason: 'Rained off',
						acknowledgedProgressedMissionCancellation: false,
						acknowledgedPartialWorkCancellation: false,
					}),
				},
			);

			expect(response.status).toBe(200);
			const mission = await readMission(db, missionId);
			expect(mission.cancelled_at).not.toBeNull();
		});
	});

	// -----------------------------------------------------------------------
	// Deletion
	// -----------------------------------------------------------------------

	it('refuses deleting a completed mission, and deletes nothing', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'delete_completed');
			const actor = await createProfile(db, org);
			const missionId = await createMission(db, org, {
				startedAt: '2026-08-10 08:00:00+00',
				completedAt: '2026-08-10 17:00:00+00',
			});
			const stopId = await createStop(db, org, missionId, 0, {
				completedAt: '2026-08-10 09:00:00+00',
			});

			const response = await missionApp(db, org, actor).request(
				`/mission-dispatch/missions/${missionId}`,
				{
					method: 'DELETE',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ acknowledgedCompletedMissionDeletion: false }),
				},
			);

			await expectStateRefusal(response, 'acknowledgedCompletedMissionDeletion', 'completed');
			const mission = await readMission(db, missionId);
			expect(mission.deleted_at).toBeNull();
			const stop = await readStop(db, stopId);
			expect(stop.deleted_at).toBeNull();
		});
	});

	it('deletes a mission that never ran', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'delete_scheduled');
			const actor = await createProfile(db, org);
			const missionId = await createMission(db, org, {});

			const response = await missionApp(db, org, actor).request(
				`/mission-dispatch/missions/${missionId}`,
				{
					method: 'DELETE',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ acknowledgedCompletedMissionDeletion: false }),
				},
			);

			expect(response.status).toBe(200);
			const mission = await readMission(db, missionId);
			expect(mission.deleted_at).not.toBeNull();
		});
	});

	// -----------------------------------------------------------------------
	// Stops
	// -----------------------------------------------------------------------

	it('refuses moving the link under a stop that was already handled', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'stop_link_progressed');
			const actor = await createProfile(db, org);
			const missionId = await createMission(db, org, { startedAt: '2026-08-10 08:00:00+00' });
			const stopId = await createStop(db, org, missionId, 0, {
				completedAt: '2026-08-10 09:00:00+00',
			});
			const addressId = await createAddress(db, org);

			const response = await missionApp(db, org, actor).request(
				`/mission-dispatch/mission-items/${stopId}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ addressId, acknowledgedProgressedItemLinkChange: false }),
				},
			);

			await expectStateRefusal(response, 'acknowledgedProgressedItemLinkChange', 'completed');
			const stop = await readStop(db, stopId);
			expect(stop.address_id).toBeNull();
		});
	});

	it('refuses reordering stops a crew has already got through', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'reorder_progressed');
			const actor = await createProfile(db, org);
			const missionId = await createMission(db, org, { startedAt: '2026-08-10 08:00:00+00' });
			const first = await createStop(db, org, missionId, 1);
			const second = await createStop(db, org, missionId, 2, {
				skippedAt: '2026-08-10 09:00:00+00',
			});

			const response = await missionApp(db, org, actor).request(
				`/mission-dispatch/missions/${missionId}/move-items`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						missionItemIds: [second],
						placement: { kind: 'start' },
						acknowledgedProgressedItemReorder: false,
					}),
				},
			);

			await expectStateRefusal(
				response,
				'acknowledgedProgressedItemReorder',
				'completed or skipped',
			);
			expect((await readStop(db, first)).position).toBe(1);
			expect((await readStop(db, second)).position).toBe(2);
		});
	});

	it('refuses removing a stop that carries progress, and removes nothing', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'stop_removed_progressed');
			const actor = await createProfile(db, org);
			const missionId = await createMission(db, org, { startedAt: '2026-08-10 08:00:00+00' });
			const stopId = await createStop(db, org, missionId, 0, {
				skippedAt: '2026-08-10 09:00:00+00',
			});

			const response = await missionApp(db, org, actor).request(
				`/mission-dispatch/mission-items/${stopId}`,
				{
					method: 'DELETE',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ acknowledgedItemProgressDeletion: false }),
				},
			);

			await expectStateRefusal(
				response,
				'acknowledgedItemProgressDeletion',
				'completed or skipped',
			);
			const stop = await readStop(db, stopId);
			expect(stop.deleted_at).toBeNull();
		});
	});

	it('refuses removing a stop that records already cite', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'stop_removed_worked');
			const actor = await createProfile(db, org);
			const missionId = await createMission(db, org, { startedAt: '2026-08-10 08:00:00+00' });
			const stopId = await createStop(db, org, missionId, 0);
			await createSourceReduction(db, org, stopId);

			const response = await missionApp(db, org, actor).request(
				`/mission-dispatch/mission-items/${stopId}`,
				{
					method: 'DELETE',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ acknowledgedActualActionDetach: false }),
				},
			);

			await expectStateRefusal(response, 'acknowledgedActualActionDetach', 'recorded');
			const stop = await readStop(db, stopId);
			expect(stop.deleted_at).toBeNull();
		});
	});

	it('refuses moving the address of a stop that records already cite', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'stop_context_worked');
			const actor = await createProfile(db, org);
			const missionId = await createMission(db, org, {});
			const stopId = await createStop(db, org, missionId, 0);
			await createSourceReduction(db, org, stopId);
			const addressId = await createAddress(db, org);

			const response = await missionApp(db, org, actor).request(
				`/mission-dispatch/mission-items/${stopId}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ addressId, acknowledgedActualActionContextChange: false }),
				},
			);

			await expectStateRefusal(response, 'acknowledgedActualActionContextChange', 'recorded');
			const stop = await readStop(db, stopId);
			expect(stop.address_id).toBeNull();
		});
	});

	it('removes a stop nobody has reached', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'stop_removed_pending');
			const actor = await createProfile(db, org);
			const missionId = await createMission(db, org, { startedAt: '2026-08-10 08:00:00+00' });
			const stopId = await createStop(db, org, missionId, 0);

			const response = await missionApp(db, org, actor).request(
				`/mission-dispatch/mission-items/${stopId}`,
				{
					method: 'DELETE',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ acknowledgedItemProgressDeletion: false }),
				},
			);

			expect(response.status).toBe(200);
			const stop = await readStop(db, stopId);
			expect(stop.deleted_at).not.toBeNull();
		});
	});

	// -----------------------------------------------------------------------
	// The requested action a stop is raised from
	// -----------------------------------------------------------------------

	it('refuses a stop whose request recommends a method the mission is not planned for', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'method_mismatch');
			const actor = await createProfile(db, org);
			const planned = await createSourceReductionMethod(db, org, 'Ditch clearing');
			const recommended = await createSourceReductionMethod(db, org, 'Culvert clearing');
			const missionId = await createMission(db, org, { plannedMethodId: planned });
			const requestId = await createRequestedControlAction(db, org, recommended);

			const response = await missionApp(db, org, actor).request('/mission-dispatch/mission-items', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: crypto.randomUUID(),
					missionId,
					requestedControlActionId: requestId,
					acknowledgedMethodMismatch: false,
				}),
			});

			await expectStateRefusal(response, 'acknowledgedMethodMismatch', 'different method');
			expect(await countStops(db, missionId)).toBe(0);
		});
	});

	it('says nothing about a method the mission and the request agree on', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'method_agreed');
			const actor = await createProfile(db, org);
			const methodId = await createSourceReductionMethod(db, org, 'Ditch clearing');
			const missionId = await createMission(db, org, { plannedMethodId: methodId });
			const requestId = await createRequestedControlAction(db, org, methodId);

			const response = await missionApp(db, org, actor).request('/mission-dispatch/mission-items', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: crypto.randomUUID(),
					missionId,
					requestedControlActionId: requestId,
					acknowledgedMethodMismatch: false,
					acknowledgedDuplicateRequestedActionMissioning: false,
				}),
			});

			expect(response.status).toBe(201);
			expect(await countStops(db, missionId)).toBe(1);
		});
	});

	it('refuses scheduling a request that is already a stop somewhere', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'duplicate_missioning');
			const actor = await createProfile(db, org);
			const firstMission = await createMission(db, org, {});
			const secondMission = await createMission(db, org, {});
			const requestId = await createRequestedControlAction(db, org, null);
			await createStop(db, org, firstMission, 0, { requestedControlActionId: requestId });

			const response = await missionApp(db, org, actor).request('/mission-dispatch/mission-items', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: crypto.randomUUID(),
					missionId: secondMission,
					requestedControlActionId: requestId,
					acknowledgedDuplicateRequestedActionMissioning: false,
				}),
			});

			await expectStateRefusal(
				response,
				'acknowledgedDuplicateRequestedActionMissioning',
				'already a stop',
			);
			expect(await countStops(db, secondMission)).toBe(0);
		});
	});

	// -----------------------------------------------------------------------
	// Early start
	// -----------------------------------------------------------------------

	it('refuses starting a mission more than twelve hours early, and starts nothing', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'early_start');
			const actor = await createProfile(db, org);
			const missionId = await createMission(db, org, {});
			await createStop(db, org, missionId, 0);

			const response = await missionApp(db, org, actor).request(
				`/mission-dispatch/missions/${missionId}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					// Scheduled for 2026-08-10 08:00Z, started a day and a half before.
					body: JSON.stringify({
						startedAt: '2026-08-08T20:00:00.000Z',
						acknowledgedEarlyStart: false,
					}),
				},
			);

			await expectStateRefusal(response, 'acknowledgedEarlyStart', 'twelve hours');
			const mission = await readMission(db, missionId);
			expect(mission.started_at).toBeNull();
		});
	});

	it('starts a mission inside the twelve-hour window', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'start_in_window');
			const actor = await createProfile(db, org);
			const missionId = await createMission(db, org, {});
			await createStop(db, org, missionId, 0);

			const response = await missionApp(db, org, actor).request(
				`/mission-dispatch/missions/${missionId}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						startedAt: '2026-08-10T02:00:00.000Z',
						acknowledgedEarlyStart: false,
					}),
				},
			);

			expect(response.status).toBe(200);
			const mission = await readMission(db, missionId);
			expect(mission.started_at).not.toBeNull();
		});
	});

	it('refuses completing a stop more than twelve hours before the mission was due', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'early_stop_completion');
			const actor = await createProfile(db, org);
			const missionId = await createMission(db, org, { startedAt: '2026-08-08 19:00:00+00' });
			const stopId = await createStop(db, org, missionId, 0);

			const response = await missionApp(db, org, actor).request(
				`/mission-dispatch/mission-items/${stopId}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						completedAt: '2026-08-08T20:00:00.000Z',
						acknowledgedEarlyStart: false,
					}),
				},
			);

			await expectStateRefusal(response, 'acknowledgedEarlyStart', 'twelve hours');
			const stop = await readStop(db, stopId);
			expect(stop.completed_at).toBeNull();
		});
	});
});

// ===========================================================================
// The refusal
// ===========================================================================

/**
 * The settled state-refusal body: 409, the flag, an empty `consequences` list,
 * and a message that says what the state is rather than naming the flag.
 */
async function expectStateRefusal(
	response: Response,
	flag: string,
	messageContains: string,
): Promise<void> {
	expect(response.status).toBe(409);
	const body = (await response.json()) as {
		readonly error: string;
		readonly flag: string;
		readonly message: string;
		readonly consequences: readonly unknown[];
	};
	expect(body.error).toBe('acknowledgement_required');
	expect(body.flag).toBe(flag);
	expect(body.consequences).toEqual([]);
	expect(body.message).toContain(messageContains);
}

// ===========================================================================
// App
// ===========================================================================

type Db = Kysely<SimmerDatabase>;

function missionApp(db: Db, organizationId: string, profileId: string) {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerMissionDispatchCommandRoutes(app, {
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

async function createMission(
	db: Db,
	organizationId: string,
	state: {
		readonly startedAt?: string;
		readonly completedAt?: string;
		readonly assignedToProfileId?: string;
		readonly plannedMethodId?: string;
	},
): Promise<string> {
	const row = await db
		.insertInto('missions')
		.values({
			organization_id: organizationId,
			control_type: 'source_reduction',
			mission_name: 'Levee round',
			scheduled_start_at: sql`timestamptz '2026-08-10 08:00:00+00'`,
			...(state.startedAt === undefined
				? {}
				: { started_at: sql`${state.startedAt}::timestamptz` }),
			...(state.completedAt === undefined
				? {}
				: { completed_at: sql`${state.completedAt}::timestamptz` }),
			...(state.assignedToProfileId === undefined
				? {}
				: { assigned_to_profile_id: state.assignedToProfileId }),
			...(state.plannedMethodId === undefined ? {} : { planned_method_id: state.plannedMethodId }),
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createStop(
	db: Db,
	organizationId: string,
	missionId: string,
	position: number,
	progress: {
		readonly completedAt?: string;
		readonly skippedAt?: string;
		readonly requestedControlActionId?: string;
	} = {},
): Promise<string> {
	const row = await db
		.insertInto('mission_items')
		.values({
			organization_id: organizationId,
			mission_id: missionId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			position,
			...(progress.completedAt === undefined
				? {}
				: { completed_at: sql`${progress.completedAt}::timestamptz` }),
			...(progress.skippedAt === undefined
				? {}
				: { skipped_at: sql`${progress.skippedAt}::timestamptz`, skip_reason: 'Locked gate' }),
			...(progress.requestedControlActionId === undefined
				? {}
				: { requested_control_action_id: progress.requestedControlActionId }),
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createSourceReductionMethod(
	db: Db,
	organizationId: string,
	name: string,
): Promise<string> {
	const row = await db
		.insertInto('source_reduction_methods')
		.values({ organization_id: organizationId, name })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

/** Actual control work filed against a stop, which is what "worked" means. */
async function createSourceReduction(
	db: Db,
	organizationId: string,
	missionItemId: string,
): Promise<string> {
	const methodId = await createSourceReductionMethod(db, organizationId, 'Ditch clearing');
	const unit = await db
		.insertInto('units')
		.values({
			code: 'test_sources',
			unit_name: 'sources',
			abbreviation: 'src',
			unit_type: 'count',
			unit_system: 'si',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	const row = await db
		.insertInto('source_reductions')
		.values({
			organization_id: organizationId,
			source_reduction_method_id: methodId,
			source_reduction_date: sql`date '2026-08-10'`,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			sources_eliminated_amount: 3,
			sources_eliminated_unit_id: unit.id,
			mission_item_id: missionItemId,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createRequestedControlAction(
	db: Db,
	organizationId: string,
	recommendedMethodId: string | null,
): Promise<string> {
	const row = await db
		.insertInto('requested_control_actions')
		.values({
			organization_id: organizationId,
			control_type: 'source_reduction',
			recommended_method_id: recommendedMethodId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			summary: 'Standing water behind the levee.',
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

// ===========================================================================
// Reads
// ===========================================================================

async function readMission(db: Db, missionId: string) {
	return db
		.selectFrom('missions')
		.select([
			'assigned_to_profile_id',
			'cancelled_at',
			'deleted_at',
			'planned_method_id',
			'started_at',
			'scheduled_start_at',
		])
		.where('id', '=', missionId)
		.executeTakeFirstOrThrow();
}

async function readStop(db: Db, missionItemId: string) {
	return db
		.selectFrom('mission_items')
		.select(['address_id', 'completed_at', 'deleted_at', 'position'])
		.where('id', '=', missionItemId)
		.executeTakeFirstOrThrow();
}

async function countStops(db: Db, missionId: string): Promise<number> {
	const row = await db
		.selectFrom('mission_items')
		.select((eb) => eb.fn.countAll<string>().as('total'))
		.where('mission_id', '=', missionId)
		.where('deleted_at', 'is', null)
		.executeTakeFirstOrThrow();
	return Number(row.total);
}

async function countComments(db: Db, missionId: string): Promise<number> {
	const row = await db
		.selectFrom('comments')
		.select((eb) => eb.fn.countAll<string>().as('total'))
		.where('entity_type', '=', 'mission')
		.where('entity_id', '=', missionId)
		.executeTakeFirstOrThrow();
	return Number(row.total);
}
