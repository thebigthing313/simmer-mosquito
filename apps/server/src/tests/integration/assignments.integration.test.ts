import { type Kysely, type SimmerDatabase, sql } from '@simmer-mosquito/db';
import {
	createActingOrganization,
	createRoute,
	createRouteItem,
	describeDbIntegration,
	withTestDb,
} from '@simmer-mosquito/db/test-support';
import {
	createAssignmentFromRouteCommand,
	type FieldWorkCommand,
	selfAssignRouteCommand,
} from '@simmer-mosquito/domain';
import { expect, it } from 'vitest';
import { writeAssignmentCommand } from '../../writers/field-work/assignments.js';

/**
 * The assignments writer inserts the day it was handed, against real Postgres.
 *
 * #1092 moved the day for `fieldWork.selfAssignRoute` out of the writer and
 * into the intent map, and the unit test pins that `todayInTimeZone` is what
 * fills it. What nothing read back was the other half: `insertAssignment`
 * writes `assignment_date: localDateColumn(payload.assignmentDate)`, which is
 * `${value}::date`, and a `date` column is where an off-by-one would appear
 * (#1118). Both paths that share `insertAssignment` are driven here, the
 * self-assign and the create-from-route, over a month end and a day either
 * side of each 2026 DST change in America/Los_Angeles.
 *
 * The column is read back as text. The driver parses a `date` into a JS
 * `Date` at local midnight, so under a non-UTC process zone a `toISOString`
 * on it moves the day and the off-by-one lands in the test rather than in the
 * writer.
 */
describeDbIntegration('assignments writer', () => {
	const DAYS = [
		'2026-01-31',
		'2026-02-28',
		'2026-03-07',
		'2026-03-08',
		'2026-03-09',
		'2026-10-31',
		'2026-11-01',
		'2026-11-02',
		'2026-12-31',
	] as const;

	it('self-assigns a route on the day the command names', async () => {
		await withTestDb(async ({ db }) => {
			const surface = await createRouteSurface(db);
			for (const day of DAYS) {
				const assignmentId = crypto.randomUUID();
				await write(
					db,
					selfAssignRouteCommand({
						organizationId: surface.org,
						actorProfileId: surface.actor,
						assignmentId,
						routeId: surface.route,
						assignmentDate: day,
						assignmentItemIds: [
							{ routeItemId: surface.routeItem, assignmentItemId: crypto.randomUUID() },
						],
					}),
				);
				expect(await readAssignmentDate(db, assignmentId)).toBe(day);
			}
		});
	});

	it('creates an assignment from a route on the day the command names', async () => {
		await withTestDb(async ({ db }) => {
			const surface = await createRouteSurface(db);
			for (const day of DAYS) {
				const assignmentId = crypto.randomUUID();
				await write(
					db,
					createAssignmentFromRouteCommand({
						organizationId: surface.org,
						actorProfileId: surface.actor,
						assignmentId,
						routeId: surface.route,
						assignmentDate: day,
						assignmentName: 'Creek line',
						assignedToProfileId: surface.actor,
						assignmentItemIds: [
							{ routeItemId: surface.routeItem, assignmentItemId: crypto.randomUUID() },
						],
					}),
				);
				expect(await readAssignmentDate(db, assignmentId)).toBe(day);
			}
		});
	});
});

type Db = Kysely<SimmerDatabase>;

async function createRouteSurface(db: Db) {
	const { organizationId: org, actorProfileId: actor } = await createActingOrganization(db, {
		profile: { display_name: 'Collector' },
	});
	const route = await createRoute(db, org, { route_name: 'Creek line' });
	const routeItem = await createRouteItem(db, org, {
		routeId: route,
		entityType: 'habitat',
		entityId: crypto.randomUUID(),
	});
	return { org, actor, route, routeItem };
}

function write(db: Db, command: FieldWorkCommand): Promise<unknown> {
	return db.transaction().execute((trx) => writeAssignmentCommand(trx, command));
}

async function readAssignmentDate(db: Db, assignmentId: string): Promise<string> {
	const row = await db
		.selectFrom('assignments')
		.select(sql<string>`assignment_date::text`.as('assignment_date'))
		.where('id', '=', assignmentId)
		.executeTakeFirstOrThrow();
	return row.assignment_date;
}
