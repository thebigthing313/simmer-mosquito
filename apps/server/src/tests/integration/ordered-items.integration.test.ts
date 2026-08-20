import { type Kysely, type SimmerDatabase, sql } from '@simmer-mosquito/db';
import { describeDbIntegration, withTestDb } from '@simmer-mosquito/db/test-support';
import {
	type AssignmentItemPlacement,
	addAssignmentItemCommand,
	addMissionItemCommand,
	addMissionItemFromRequestedControlActionCommand,
	addRouteItemCommand,
} from '@simmer-mosquito/domain';
import { expect, it } from 'vitest';
import { writeAssignmentItemCommand } from '../../field-work-commands/assignment-items.js';
import { writeRouteItemCommand } from '../../field-work-commands/route-items.js';
import { writeMissionItemCommand } from '../../mission-dispatch-commands/mission-items.js';

/**
 * What the four add commands write, against real Postgres.
 *
 * The claim under test is a row count, not a return value: an add takes a
 * fractional `position` between its neighbours and touches nothing else. A fake
 * transaction would record the statements the handler issued and prove nothing
 * about the order the database then reads back, which is the thing a client
 * mirrors. Issue #162.
 *
 * Each add runs in its own transaction because `created_at` defaults to
 * Postgres `now()`, which is the transaction timestamp. Rows added in one
 * transaction share it, and it is the tie-break behind `position`.
 */
describeDbIntegration('ordered item positions', () => {
	it('adds a route stop between its neighbours without touching a sibling', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'routeadd');
			const actor = await createProfile(db, org, 'Supervisor');
			const route = await createRoute(db, org, 'North line');

			const first = await addRouteStop(db, { org, actor, route, placement: { kind: 'end' } });
			const second = await addRouteStop(db, { org, actor, route, placement: { kind: 'end' } });
			const before = await readItems(db, 'route_items', 'route_id', route);

			const inserted = await addRouteStop(db, {
				org,
				actor,
				route,
				placement: { kind: 'after', routeItemId: first },
			});

			const after = await readItems(db, 'route_items', 'route_id', route);
			expect(after.map((row) => row.id)).toEqual([first, inserted, second]);

			// The whole point. Under the old scheme this add rewrote every sibling,
			// so both of these would have moved.
			expect(after.filter((row) => row.id !== inserted)).toEqual(before);

			const insertedRow = after[1] as (typeof after)[number];
			expect(insertedRow.position).toBeGreaterThan((before[0] as (typeof before)[number]).position);
			expect(insertedRow.position).toBeLessThan((before[1] as (typeof before)[number]).position);
		});
	});

	it('adds a route stop at either end outside the current range', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'routeends');
			const actor = await createProfile(db, org, 'Supervisor');
			const route = await createRoute(db, org, 'South line');

			await addRouteStop(db, { org, actor, route, placement: { kind: 'end' } });
			const head = await addRouteStop(db, { org, actor, route, placement: { kind: 'start' } });
			const tail = await addRouteStop(db, { org, actor, route, placement: { kind: 'end' } });

			const rows = await readItems(db, 'route_items', 'route_id', route);
			const positions = rows.map((row) => row.position);
			expect(rows[0]?.id).toBe(head);
			expect(rows[2]?.id).toBe(tail);
			expect(Math.min(...positions)).toBe(rows[0]?.position);
			expect(Math.max(...positions)).toBe(rows[2]?.position);
		});
	});

	it('reads back the order a run of adds and removes asked for', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'routerun');
			const actor = await createProfile(db, org, 'Supervisor');
			const route = await createRoute(db, org, 'Creek line');

			const a = await addRouteStop(db, { org, actor, route, placement: { kind: 'end' } });
			const b = await addRouteStop(db, { org, actor, route, placement: { kind: 'end' } });
			const c = await addRouteStop(db, {
				org,
				actor,
				route,
				placement: { kind: 'before', routeItemId: b },
			});
			await db
				.updateTable('route_items')
				.set({ deleted_at: sql`now()` })
				.where('id', '=', a)
				.execute();
			const d = await addRouteStop(db, {
				org,
				actor,
				route,
				placement: { kind: 'after', routeItemId: c },
			});
			const e = await addRouteStop(db, { org, actor, route, placement: { kind: 'start' } });

			const rows = await readItems(db, 'route_items', 'route_id', route);
			expect(rows.map((row) => row.id)).toEqual([e, c, d, b]);

			// Removing `a` left its position behind. Gaps are what the fractional
			// column is for, so nothing closes them.
			const gaps = rows.map((row) => row.position);
			expect(new Set(gaps).size).toBe(gaps.length);
		});
	});

	it('adds an assignment stop between its neighbours without touching a sibling', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'assignadd');
			const actor = await createProfile(db, org, 'Collector');
			const assignment = await createAssignment(db, org, actor);

			const first = await addAssignmentStop(db, {
				org,
				actor,
				assignment,
				placement: { kind: 'end' },
			});
			const second = await addAssignmentStop(db, {
				org,
				actor,
				assignment,
				placement: { kind: 'end' },
			});
			const before = await readItems(db, 'assignment_items', 'assignment_id', assignment);

			const inserted = await addAssignmentStop(db, {
				org,
				actor,
				assignment,
				placement: { kind: 'after', assignmentItemId: first },
			});

			const after = await readItems(db, 'assignment_items', 'assignment_id', assignment);
			expect(after.map((row) => row.id)).toEqual([first, inserted, second]);
			expect(after.filter((row) => row.id !== inserted)).toEqual(before);
			expect(after[1]?.position).toBe(0.5);
			expect(second).toBe(after[2]?.id);
		});
	});

	it('adds a mission stop between its neighbours without touching a sibling', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'missionadd');
			const actor = await createProfile(db, org, 'Applicator');
			const mission = await createMission(db, org);

			const first = await addMissionStop(db, { org, actor, mission, placement: { kind: 'end' } });
			const second = await addMissionStop(db, { org, actor, mission, placement: { kind: 'end' } });
			const before = await readItems(db, 'mission_items', 'mission_id', mission);

			const inserted = await addMissionStop(db, {
				org,
				actor,
				mission,
				placement: { kind: 'after', missionItemId: first },
			});

			const after = await readItems(db, 'mission_items', 'mission_id', mission);
			expect(after.map((row) => row.id)).toEqual([first, inserted, second]);
			expect(after.filter((row) => row.id !== inserted)).toEqual(before);
			expect(after[1]?.position).toBe(0.5);
		});
	});

	it('adds a mission stop from a requested action at the head of the list', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'missionrca');
			const actor = await createProfile(db, org, 'Applicator');
			const mission = await createMission(db, org);
			const requested = await createRequestedControlAction(db, org);

			const existing = await addMissionStop(db, {
				org,
				actor,
				mission,
				placement: { kind: 'end' },
			});
			const before = await readItems(db, 'mission_items', 'mission_id', mission);

			const missionItemId = crypto.randomUUID();
			await db.transaction().execute((trx) =>
				writeMissionItemCommand(
					trx,
					addMissionItemFromRequestedControlActionCommand({
						organizationId: org,
						actorProfileId: actor,
						missionItemId,
						missionId: mission,
						requestedControlActionId: requested,
						placement: { kind: 'start' },
					}),
				),
			);

			const after = await readItems(db, 'mission_items', 'mission_id', mission);
			expect(after.map((row) => row.id)).toEqual([missionItemId, existing]);
			expect(after.filter((row) => row.id !== missionItemId)).toEqual(before);

			// The list started at zero, so the head cannot be half of it.
			expect(after[0]?.position).toBeLessThan(0);
		});
	});
});

type Db = Kysely<SimmerDatabase>;

const POINT = { type: 'Point' as const, coordinates: [-121.49, 38.58] };

async function readItems(
	db: Db,
	table: 'route_items' | 'assignment_items' | 'mission_items',
	parentColumn: 'route_id' | 'assignment_id' | 'mission_id',
	parentId: string,
) {
	return db
		.selectFrom(table)
		.select(['id', 'position', 'updated_at', 'updated_by_profile_id'])
		.where(parentColumn, '=', parentId)
		.where('deleted_at', 'is', null)
		.orderBy('position', 'asc')
		.orderBy('created_at', 'asc')
		.execute();
}

async function addRouteStop(
	db: Db,
	input: {
		org: string;
		actor: string;
		route: string;
		placement: { kind: 'start' | 'end' } | { kind: 'before' | 'after'; routeItemId: string };
	},
): Promise<string> {
	const routeItemId = crypto.randomUUID();
	await db.transaction().execute((trx) =>
		writeRouteItemCommand(
			trx,
			addRouteItemCommand({
				organizationId: input.org,
				actorProfileId: input.actor,
				routeItemId,
				routeId: input.route,
				target: { type: 'habitat', id: crypto.randomUUID() },
				placement: input.placement,
			}),
		),
	);
	return routeItemId;
}

async function addAssignmentStop(
	db: Db,
	input: {
		org: string;
		actor: string;
		assignment: string;
		placement: AssignmentItemPlacement;
	},
): Promise<string> {
	const assignmentItemId = crypto.randomUUID();
	await db.transaction().execute((trx) =>
		writeAssignmentItemCommand(
			trx,
			addAssignmentItemCommand({
				organizationId: input.org,
				actorProfileId: input.actor,
				assignmentItemId,
				assignmentId: input.assignment,
				target: { type: 'habitat', id: crypto.randomUUID() },
				placement: input.placement,
			}),
		),
	);
	return assignmentItemId;
}

async function addMissionStop(
	db: Db,
	input: {
		org: string;
		actor: string;
		mission: string;
		placement: { kind: 'start' | 'end' } | { kind: 'before' | 'after'; missionItemId: string };
	},
): Promise<string> {
	const missionItemId = crypto.randomUUID();
	await db.transaction().execute((trx) =>
		writeMissionItemCommand(
			trx,
			addMissionItemCommand({
				organizationId: input.org,
				actorProfileId: input.actor,
				missionItemId,
				missionId: input.mission,
				geometry: POINT,
				placement: input.placement,
			}),
		),
	);
	return missionItemId;
}

async function createOrganization(db: Db, slug: string): Promise<string> {
	const row = await db
		.insertInto('organizations')
		.values({ workos_organization_id: `workos_${slug}`, name: `${slug} District` })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createProfile(db: Db, organizationId: string, name: string): Promise<string> {
	const row = await db
		.insertInto('profiles')
		.values({ organization_id: organizationId, display_name: name })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createRoute(db: Db, organizationId: string, name: string): Promise<string> {
	const row = await db
		.insertInto('routes')
		.values({ organization_id: organizationId, route_name: name, route_type: 'habitat' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createAssignment(
	db: Db,
	organizationId: string,
	actorProfileId: string,
): Promise<string> {
	const row = await db
		.insertInto('assignments')
		.values({
			organization_id: organizationId,
			assignment_name: 'Tuesday larval',
			assigned_to_profile_id: actorProfileId,
			assignment_date: new Date('2026-08-18T00:00:00.000Z'),
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createMission(db: Db, organizationId: string): Promise<string> {
	const row = await db
		.insertInto('missions')
		.values({
			organization_id: organizationId,
			control_type: 'application',
			scheduled_start_at: new Date('2026-08-18T14:00:00.000Z'),
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createRequestedControlAction(db: Db, organizationId: string): Promise<string> {
	const row = await db
		.insertInto('requested_control_actions')
		.values({
			organization_id: organizationId,
			control_type: 'application',
			geom: sql`st_setsrid(st_geomfromgeojson(${JSON.stringify(POINT)}), 4326)`,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}
