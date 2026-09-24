import { type Kysely, type SimmerDatabase, sql } from '@simmer-mosquito/db';
import {
	createActingOrganization,
	createAddress,
	describeDbIntegration,
	createMission as insertMission,
	createMissionItem as insertMissionItem,
	createRequestedControlAction as insertRequestedControlAction,
	withTestDb,
} from '@simmer-mosquito/db/test-support';
import { expect, it } from 'vitest';
import { command, commandApp } from './support/command-app.js';

/**
 * A Mission stop's name, read back out of `mission_items` after each of the four
 * commands that write it (#1227).
 *
 * The table-commands unit suite asserts the command a request body becomes, and
 * `tsc` holds the writer's keys to `MissionItemsTable`. Neither sees a writer
 * that sets `name` from the wrong `string | null` field of the payload, so each
 * case here posts through the real command surface and reads the column.
 *
 * The same cases assert `normalizeMissionItemName` where it lands: a padded name
 * is stored trimmed, and a name of spaces and a name left out are both `null`.
 */
describeDbIntegration('mission stop names', () => {
	// -----------------------------------------------------------------------
	// missionDispatch.addMissionItem
	// -----------------------------------------------------------------------

	it('stores the name a placed stop was added with, trimmed', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId: org, actorProfileId: actor } = await createActingOrganization(db);
			const missionId = await createMission(db, org);
			const stopId = crypto.randomUUID();

			const response = await commandApp(db, org, actor).request(
				'/commands/mission_items',
				command('POST', ['missionDispatch.addMissionItem'], {
					id: stopId,
					mission_id: missionId,
					name: '  North culvert  ',
					geometry: POINT,
				}),
			);

			expect(response.status).toBe(201);
			expect(await readName(db, stopId)).toBe('North culvert');
		});
	});

	it('stores null for a placed stop named with spaces or not named at all', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId: org, actorProfileId: actor } = await createActingOrganization(db);
			const missionId = await createMission(db, org);
			const app = commandApp(db, org, actor);
			const spacesId = crypto.randomUUID();
			const omittedId = crypto.randomUUID();

			const spacesResponse = await app.request(
				'/commands/mission_items',
				command('POST', ['missionDispatch.addMissionItem'], {
					id: spacesId,
					mission_id: missionId,
					name: '   ',
					geometry: POINT,
				}),
			);
			const omittedResponse = await app.request(
				'/commands/mission_items',
				command('POST', ['missionDispatch.addMissionItem'], {
					id: omittedId,
					mission_id: missionId,
					geometry: POINT,
				}),
			);

			expect(spacesResponse.status).toBe(201);
			expect(omittedResponse.status).toBe(201);
			expect(await readName(db, spacesId)).toBeNull();
			expect(await readName(db, omittedId)).toBeNull();
		});
	});

	// -----------------------------------------------------------------------
	// missionDispatch.addMissionItemFromRequestedControlAction
	// -----------------------------------------------------------------------

	it('stores the name a stop drawn off a request was added with, trimmed', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId: org, actorProfileId: actor } = await createActingOrganization(db);
			const missionId = await createMission(db, org);
			const requestId = await createRequestedControlAction(db, org);
			const stopId = crypto.randomUUID();

			const response = await commandApp(db, org, actor).request(
				'/commands/mission_items',
				command('POST', ['missionDispatch.addMissionItemFromRequestedControlAction'], {
					id: stopId,
					mission_id: missionId,
					name: '\tBehind the levee ',
					requested_control_action_id: requestId,
				}),
			);

			expect(response.status).toBe(201);
			expect(await readName(db, stopId)).toBe('Behind the levee');
		});
	});

	it('stores null for a stop drawn off a request named with spaces or not named at all', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId: org, actorProfileId: actor } = await createActingOrganization(db);
			const missionId = await createMission(db, org);
			const app = commandApp(db, org, actor);
			const spacesId = crypto.randomUUID();
			const omittedId = crypto.randomUUID();

			const spacesResponse = await app.request(
				'/commands/mission_items',
				command('POST', ['missionDispatch.addMissionItemFromRequestedControlAction'], {
					id: spacesId,
					mission_id: missionId,
					name: '  ',
					requested_control_action_id: await createRequestedControlAction(db, org),
				}),
			);
			const omittedResponse = await app.request(
				'/commands/mission_items',
				command('POST', ['missionDispatch.addMissionItemFromRequestedControlAction'], {
					id: omittedId,
					mission_id: missionId,
					requested_control_action_id: await createRequestedControlAction(db, org),
				}),
			);

			expect(spacesResponse.status).toBe(201);
			expect(omittedResponse.status).toBe(201);
			expect(await readName(db, spacesId)).toBeNull();
			expect(await readName(db, omittedId)).toBeNull();
		});
	});

	// -----------------------------------------------------------------------
	// missionDispatch.createMission, initial items
	// -----------------------------------------------------------------------

	it('stores the name of every stop a mission is created with', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId: org, actorProfileId: actor } = await createActingOrganization(db);
			const missionId = crypto.randomUUID();
			const placedId = crypto.randomUUID();
			const drawnId = crypto.randomUUID();
			const spacesId = crypto.randomUUID();
			const omittedId = crypto.randomUUID();

			const response = await commandApp(db, org, actor).request(
				'/commands/missions',
				command('POST', ['missionDispatch.createMission'], {
					id: missionId,
					control_type: 'source_reduction',
					scheduled_start_at: '2026-08-10T08:00:00.000Z',
					// The initial stops are read from `mission_items` and nowhere else, so
					// a body naming them anything else creates a mission with none.
					mission_items: [
						{ id: placedId, kind: 'explicit', name: ' South gate ', geometry: POINT },
						{
							id: drawnId,
							kind: 'fromRequestedControlAction',
							name: 'Levee ditch  ',
							requested_control_action_id: await createRequestedControlAction(db, org),
						},
						{ id: spacesId, kind: 'explicit', name: '    ', geometry: POINT },
						{ id: omittedId, kind: 'explicit', geometry: POINT },
					],
				}),
			);

			expect(response.status).toBe(201);
			expect(await countStops(db, missionId)).toBe(4);
			expect(await readName(db, placedId)).toBe('South gate');
			expect(await readName(db, drawnId)).toBe('Levee ditch');
			expect(await readName(db, spacesId)).toBeNull();
			expect(await readName(db, omittedId)).toBeNull();
		});
	});

	// -----------------------------------------------------------------------
	// missionDispatch.renameMissionItem
	// -----------------------------------------------------------------------

	it('renames a stop to the trimmed name', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId: org, actorProfileId: actor } = await createActingOrganization(db);
			const missionId = await createMission(db, org);
			const stopId = await insertMissionItem(db, org, missionId, { name: 'Old name' });

			const response = await commandApp(db, org, actor).request(
				`/commands/mission_items/${stopId}`,
				command('PATCH', ['missionDispatch.renameMissionItem'], { name: '  Culvert 4  ' }),
			);

			expect(response.status).toBe(200);
			expect(await readName(db, stopId)).toBe('Culvert 4');
		});
	});

	// Once per kind of progress, because `mission_items_progress_exclusive` keeps a
	// stop from being completed and skipped at once, and a column left null cannot
	// show a rename that nulls it.
	it.each([
		{ progress: 'completed', skipped: false },
		{ progress: 'skipped', skipped: true },
	])('clears a stored name on a rename to null, and leaves every other column of a $progress stop', async ({
		skipped,
	}) => {
		await withTestDb(async ({ db }) => {
			const { organizationId: org, actorProfileId: actor } = await createActingOrganization(db);
			const missionId = await createMission(db, org);
			// A stop carrying a value in every column a rename could touch by
			// mistake: an address, a request, a position past the first, and progress.
			const stopId = await insertMissionItem(db, org, missionId, {
				name: 'Old name',
				position: 3,
				address_id: await createAddress(db, org),
				requested_control_action_id: await createRequestedControlAction(db, org),
				...(skipped
					? {
							skipped_at: sql`timestamptz '2026-08-10 09:00:00+00'`,
							skipped_by_profile_id: actor,
							skip_reason: 'Locked gate',
						}
					: {
							completed_at: sql`timestamptz '2026-08-10 09:30:00+00'`,
							completed_by_profile_id: actor,
						}),
			});
			const before = await readStop(db, stopId);

			const response = await commandApp(db, org, actor).request(
				`/commands/mission_items/${stopId}`,
				command('PATCH', ['missionDispatch.renameMissionItem'], { name: null }),
			);

			expect(response.status).toBe(200);
			const after = await readStop(db, stopId);
			expect(after.name).toBeNull();
			expect(unchangedColumns(after)).toEqual(unchangedColumns(before));
		});
	});

	it('clears a stored name on a rename to spaces', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId: org, actorProfileId: actor } = await createActingOrganization(db);
			const missionId = await createMission(db, org);
			const stopId = await insertMissionItem(db, org, missionId, { name: 'Old name' });

			const response = await commandApp(db, org, actor).request(
				`/commands/mission_items/${stopId}`,
				command('PATCH', ['missionDispatch.renameMissionItem'], { name: '   ' }),
			);

			expect(response.status).toBe(200);
			expect(await readName(db, stopId)).toBeNull();
		});
	});
});

type Db = Kysely<SimmerDatabase>;

const POINT = { type: 'Point', coordinates: [-90.5, 35.5] } as const;

// ===========================================================================
// Fixtures
// ===========================================================================

function createMission(db: Db, organizationId: string): Promise<string> {
	return insertMission(db, organizationId, {
		control_type: 'source_reduction',
		mission_name: 'Levee round',
		scheduled_start_at: sql`timestamptz '2026-08-10 08:00:00+00'`,
	});
}

/**
 * A request the source reduction mission above can take a stop from. It has the
 * same control type and no recommended method, so no acknowledgement has a
 * question to ask and the add goes through.
 */
function createRequestedControlAction(db: Db, organizationId: string): Promise<string> {
	return insertRequestedControlAction(db, organizationId, {
		control_type: 'source_reduction',
		recommended_method_id: null,
	});
}

// ===========================================================================
// Reads
// ===========================================================================

async function readName(db: Db, missionItemId: string): Promise<string | null> {
	const row = await db
		.selectFrom('mission_items')
		.select('name')
		.where('id', '=', missionItemId)
		.executeTakeFirstOrThrow();
	return row.name;
}

async function readStop(db: Db, missionItemId: string) {
	return db
		.selectFrom('mission_items')
		.selectAll()
		.where('id', '=', missionItemId)
		.executeTakeFirstOrThrow();
}

/**
 * Every column of the stop except the three a rename writes: the name itself and
 * the two stamps that say who last changed the row and when.
 */
function unchangedColumns(row: Awaited<ReturnType<typeof readStop>>) {
	const { name: _name, updated_at: _updatedAt, updated_by_profile_id: _updatedBy, ...rest } = row;
	return rest;
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
