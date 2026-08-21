import { type Kysely, type SimmerDatabase, sql } from '@simmer-mosquito/db';
import { describeDbIntegration, withTestDb } from '@simmer-mosquito/db/test-support';
import {
	type AssignmentItemPlacement,
	addAssignmentItemCommand,
	addMissionItemCommand,
	addMissionItemFromRequestedControlActionCommand,
	addRouteItemCommand,
	moveAssignmentItemsCommand,
	moveMissionItemsCommand,
	moveRouteItemsCommand,
	type RouteItemPlacement,
} from '@simmer-mosquito/domain';
import { expect, it } from 'vitest';
import { writeAssignmentItemCommand } from '../../field-work-commands/assignment-items.js';
import { writeAssignmentCommand } from '../../field-work-commands/assignments.js';
import { writeRouteItemCommand } from '../../field-work-commands/route-items.js';
import { writeRouteCommand } from '../../field-work-commands/routes.js';
import { writeMissionItemCommand } from '../../mission-dispatch-commands/mission-items.js';
import { writeMissionCommand } from '../../mission-dispatch-commands/missions.js';
import type { OrderedItemParentColumn, OrderedItemTable } from '../../ordered-items.js';

/**
 * What the four add commands and the three moves write, against real Postgres.
 *
 * The claim under test is a row count, not a return value: an add takes a
 * fractional `position` between its neighbours and touches nothing else, and a
 * move rewrites the rows it moved and no others. A fake transaction would
 * record the statements the handler issued and prove nothing about the order
 * the database then reads back, which is the thing a client mirrors. Issues
 * #162 and #196.
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

	it('moves one route stop by writing one row', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'routemove');
			const actor = await createProfile(db, org, 'Supervisor');
			const route = await createRoute(db, org, 'Levee line');
			const ids: string[] = [];
			for (let stop = 0; stop < 5; stop += 1) {
				ids.push(await addRouteStop(db, { org, actor, route, placement: { kind: 'end' } }));
			}
			const before = await readItems(db, 'route_items', 'route_id', route);

			const moved = ids[4] as string;
			await moveRouteStops(db, {
				org,
				actor,
				route,
				ids: [moved],
				placement: { kind: 'before', routeItemId: ids[1] as string },
			});

			const after = await readItems(db, 'route_items', 'route_id', route);
			expect(after.map((row) => row.id)).toEqual([ids[0], moved, ids[1], ids[2], ids[3]]);

			// The whole issue. Under the old scheme all five rows carried a new
			// `position` and a new `updated_at`; four of them had not moved.
			expect(after.filter((row) => row.id !== moved)).toEqual(
				before.filter((row) => row.id !== moved),
			);
			expect(new Set(after.map((row) => row.position)).size).toBe(after.length);
		});
	});

	it('moves a selection by writing one row per moved id', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'routeselect');
			const actor = await createProfile(db, org, 'Supervisor');
			const route = await createRoute(db, org, 'Slough line');
			const ids: string[] = [];
			for (let stop = 0; stop < 5; stop += 1) {
				ids.push(await addRouteStop(db, { org, actor, route, placement: { kind: 'end' } }));
			}
			const before = await readItems(db, 'route_items', 'route_id', route);

			const moved = [ids[3] as string, ids[4] as string];
			await moveRouteStops(db, { org, actor, route, ids: moved, placement: { kind: 'start' } });

			const after = await readItems(db, 'route_items', 'route_id', route);
			expect(after.map((row) => row.id)).toEqual([ids[3], ids[4], ids[0], ids[1], ids[2]]);
			expect(after.filter((row) => !moved.includes(row.id))).toEqual(
				before.filter((row) => !moved.includes(row.id)),
			);
			expect(new Set(after.map((row) => row.position)).size).toBe(after.length);
		});
	});

	it('reads back the order every placement asked for', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'routeplace');
			const actor = await createProfile(db, org, 'Supervisor');
			const route = await createRoute(db, org, 'Orchard line');
			const ids: string[] = [];
			for (let stop = 0; stop < 4; stop += 1) {
				ids.push(await addRouteStop(db, { org, actor, route, placement: { kind: 'end' } }));
			}
			const [a, b, c, d] = ids as [string, string, string, string];

			await moveRouteStops(db, { org, actor, route, ids: [d], placement: { kind: 'start' } });
			expect(await orderOf(db, 'route_items', 'route_id', route)).toEqual([d, a, b, c]);

			await moveRouteStops(db, { org, actor, route, ids: [d], placement: { kind: 'end' } });
			expect(await orderOf(db, 'route_items', 'route_id', route)).toEqual([a, b, c, d]);

			await moveRouteStops(db, {
				org,
				actor,
				route,
				ids: [d],
				placement: { kind: 'before', routeItemId: b },
			});
			expect(await orderOf(db, 'route_items', 'route_id', route)).toEqual([a, d, b, c]);

			await moveRouteStops(db, {
				org,
				actor,
				route,
				ids: [a],
				placement: { kind: 'after', routeItemId: b },
			});
			expect(await orderOf(db, 'route_items', 'route_id', route)).toEqual([d, b, a, c]);
		});
	});

	it('falls through to the end when the placement reference is gone', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'routemissing');
			const actor = await createProfile(db, org, 'Supervisor');
			const route = await createRoute(db, org, 'Canal line');
			const first = await addRouteStop(db, { org, actor, route, placement: { kind: 'end' } });
			const second = await addRouteStop(db, { org, actor, route, placement: { kind: 'end' } });

			// A removed stop is a placement reference a client can still hold.
			await moveRouteStops(db, {
				org,
				actor,
				route,
				ids: [first],
				placement: { kind: 'before', routeItemId: crypto.randomUUID() },
			});

			expect(await orderOf(db, 'route_items', 'route_id', route)).toEqual([second, first]);
		});
	});

	it('rewrites the moved row when the move changes nothing', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'routenoop');
			const actor = await createProfile(db, org, 'Supervisor');
			const route = await createRoute(db, org, 'Ditch line');
			const first = await addRouteStop(db, { org, actor, route, placement: { kind: 'end' } });
			const second = await addRouteStop(db, { org, actor, route, placement: { kind: 'end' } });
			const before = await readItems(db, 'route_items', 'route_id', route);

			await moveRouteStops(db, { org, actor, route, ids: [second], placement: { kind: 'end' } });

			const after = await readItems(db, 'route_items', 'route_id', route);
			expect(after.map((row) => row.id)).toEqual([first, second]);
			// A move that wrote nothing would be an optimistic transaction that never
			// sent a request, so the row it names is written either way.
			expect(after[1]?.updated_at).not.toEqual(before[1]?.updated_at);
			expect(after[0]).toEqual(before[0]);
		});
	});

	it('normalizes inside the transaction when the gap cannot hold the run', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'routetight');
			const actor = await createProfile(db, org, 'Supervisor');
			const route = await createRoute(db, org, 'Pump line');
			const ids: string[] = [];
			for (let stop = 0; stop < 4; stop += 1) {
				ids.push(await addRouteStop(db, { org, actor, route, placement: { kind: 'end' } }));
			}
			const [a, b, c, d] = ids as [string, string, string, string];

			// Two adjacent doubles. Nothing fits between them, which is the one case
			// a move cannot subdivide its way out of.
			await setPosition(db, 'route_items', a, 0);
			await setPosition(db, 'route_items', b, 1);
			await setPosition(db, 'route_items', c, 1.0000000000000002);
			await setPosition(db, 'route_items', d, 3);

			await moveRouteStops(db, {
				org,
				actor,
				route,
				ids: [d],
				placement: { kind: 'before', routeItemId: c },
			});

			const after = await readItems(db, 'route_items', 'route_id', route);
			expect(after.map((row) => row.id)).toEqual([a, b, d, c]);
			expect(after.map((row) => row.position)).toEqual([0, 1, 2, 3]);
		});
	});

	it('moves an assignment stop without touching a sibling', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'assignmove');
			const actor = await createProfile(db, org, 'Collector');
			const assignment = await createAssignment(db, org, actor);
			const ids: string[] = [];
			for (let stop = 0; stop < 4; stop += 1) {
				ids.push(
					await addAssignmentStop(db, { org, actor, assignment, placement: { kind: 'end' } }),
				);
			}
			const before = await readItems(db, 'assignment_items', 'assignment_id', assignment);
			const moved = ids[3] as string;

			await db.transaction().execute((trx) =>
				writeAssignmentCommand(
					trx,
					moveAssignmentItemsCommand({
						organizationId: org,
						actorProfileId: actor,
						assignmentId: assignment,
						assignmentItemIds: [moved],
						placement: { kind: 'before', assignmentItemId: ids[1] as string },
					}),
				),
			);

			const after = await readItems(db, 'assignment_items', 'assignment_id', assignment);
			expect(after.map((row) => row.id)).toEqual([ids[0], moved, ids[1], ids[2]]);
			expect(after.filter((row) => row.id !== moved)).toEqual(
				before.filter((row) => row.id !== moved),
			);
			expect(after[1]?.position).toBe(0.5);
		});
	});

	it('moves a mission stop without touching a sibling', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'missionmove');
			const actor = await createProfile(db, org, 'Applicator');
			const mission = await createMission(db, org);
			const ids: string[] = [];
			for (let stop = 0; stop < 4; stop += 1) {
				ids.push(await addMissionStop(db, { org, actor, mission, placement: { kind: 'end' } }));
			}
			const before = await readItems(db, 'mission_items', 'mission_id', mission);
			const moved = ids[0] as string;

			await db.transaction().execute((trx) =>
				writeMissionCommand(
					trx,
					moveMissionItemsCommand({
						organizationId: org,
						actorProfileId: actor,
						missionId: mission,
						missionItemIds: [moved],
						placement: { kind: 'after', missionItemId: ids[2] as string },
					}),
				),
			);

			const after = await readItems(db, 'mission_items', 'mission_id', mission);
			expect(after.map((row) => row.id)).toEqual([ids[1], ids[2], moved, ids[3]]);
			expect(after.filter((row) => row.id !== moved)).toEqual(
				before.filter((row) => row.id !== moved),
			);
			expect(after[2]?.position).toBe(2.5);
		});
	});
});

type Db = Kysely<SimmerDatabase>;

const POINT = { type: 'Point' as const, coordinates: [-121.49, 38.58] };

async function readItems(
	db: Db,
	table: OrderedItemTable,
	parentColumn: OrderedItemParentColumn,
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

/** The active ids under one parent, in the order the database reads them back. */
async function orderOf(
	db: Db,
	table: OrderedItemTable,
	parentColumn: OrderedItemParentColumn,
	parentId: string,
): Promise<readonly string[]> {
	const rows = await readItems(db, table, parentColumn, parentId);
	return rows.map((row) => row.id);
}

async function setPosition(
	db: Db,
	table: OrderedItemTable,
	id: string,
	position: number,
): Promise<void> {
	await db.updateTable(table).set({ position }).where('id', '=', id).execute();
}

async function moveRouteStops(
	db: Db,
	input: {
		org: string;
		actor: string;
		route: string;
		ids: readonly string[];
		placement: RouteItemPlacement;
	},
): Promise<void> {
	await db.transaction().execute((trx) =>
		writeRouteCommand(
			trx,
			moveRouteItemsCommand({
				organizationId: input.org,
				actorProfileId: input.actor,
				routeId: input.route,
				routeItemIds: [...input.ids],
				placement: input.placement,
			}),
		),
	);
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
