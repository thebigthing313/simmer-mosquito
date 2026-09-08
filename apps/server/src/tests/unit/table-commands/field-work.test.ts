/**
 * The routes and assignments intent maps, as translations.
 *
 * These four tables carry the worklist surface: a Route is the standing
 * itinerary, an Assignment is one day of it, and the item tables are the stops.
 * `writer-coverage.test.ts` already asserts that every intent they declare is
 * one their writer handles, so none of them can produce a 500. What it cannot
 * see is the reading: each builder pulls `snake_case` keys off a loose record by
 * string literal, and a wrong key is `undefined` rather than an error. A
 * required field read that way is refused by the domain, but an optional one is
 * saved as absent and the caller gets a 200.
 *
 * So these call the real builders with real bodies and read what came out. No
 * database is involved: a builder is a pure function, and `run` is never
 * touched.
 */

import { DomainValidationError } from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../auth-context.js';
import type { CommandTable } from '../../../command-payload.js';
import type { OrganizationCommandType } from '../../../command-permissions.js';
import type { WritableCommand } from '../../../command-write.js';
import { assignmentItemTableCommands } from '../../../table-commands/assignment-items.js';
import { assignmentTableCommands } from '../../../table-commands/assignments.js';
import type { IntentRequest, TableCommands } from '../../../table-commands/dispatch.js';
import { routeItemTableCommands } from '../../../table-commands/route-items.js';
import { routeTableCommands } from '../../../table-commands/routes.js';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const ROUTE = '33333333-3333-4333-8333-333333333333';
const ROUTE_ITEM = '44444444-4444-4444-8444-444444444444';
const OTHER_ROUTE_ITEM = '55555555-5555-4555-8555-555555555555';
const ASSIGNMENT = '66666666-6666-4666-8666-666666666666';
const ASSIGNMENT_ITEM = '77777777-7777-4777-8777-777777777777';
const OTHER_ASSIGNMENT_ITEM = '88888888-8888-4888-8888-888888888888';
const HABITAT = '99999999-9999-4999-8999-999999999999';
const SERVICE_REQUEST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROFILE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** The maps, with no database. Nothing here reaches `run`. */
const routes = routeTableCommands(undefined as never);
const routeItems = routeItemTableCommands(undefined as never);
const assignments = assignmentTableCommands(undefined as never);
const assignmentItems = assignmentItemTableCommands(undefined as never);

function request(
	id: string,
	payload: Record<string, unknown>,
): IntentRequest<CommandTable, string> {
	return {
		payload,
		organization: { organizationId: ORGANIZATION, actorProfileId: ACTOR },
		authContext: {
			organization: { id: ORGANIZATION, settings: null },
			profile: { id: ACTOR },
			role: 'manager',
		} as unknown as AuthContext,
		id,
	};
}

function build<TCommand extends WritableCommand>(
	spec: TableCommands<CommandTable, TCommand, unknown, string>,
	intent: OrganizationCommandType,
	id: string,
	payload: Record<string, unknown>,
): TCommand {
	const builder = spec.intents[intent];
	if (builder === undefined) {
		throw new Error(`${spec.table} does not accept ${intent}.`);
	}
	return builder(request(id, payload));
}

function changesOf(command: WritableCommand): Record<string, unknown> {
	return (command.payload as { readonly changes: Record<string, unknown> }).changes;
}

describe('routes intent map', () => {
	it('reads a new route off column names', () => {
		const command = build(routes, 'fieldWork.createRoute', ROUTE, {
			route_name: 'Tuesday north',
			route_type: 'habitat',
		});

		expect(command.type).toBe('fieldWork.createRoute');
		expect(command.payload).toMatchObject({
			organizationId: ORGANIZATION,
			actorProfileId: ACTOR,
			routeId: ROUTE,
			routeName: 'Tuesday north',
			routeType: 'habitat',
		});
	});

	it('refuses the same body keyed camelCase', () => {
		// Both fields would read as absent, and the refusal would name a missing
		// name on a request that carried one.
		expect(() =>
			build(routes, 'fieldWork.createRoute', ROUTE, {
				routeName: 'Tuesday north',
				routeType: 'habitat',
			}),
		).toThrow(DomainValidationError);
	});

	it('never reads route_type on an update', () => {
		// The kind of stop a route takes is fixed at creation. A body restating it,
		// which is what a full-row PATCH from a sync collection sends, must not
		// reach the command.
		const command = build(routes, 'fieldWork.updateRouteDetails', ROUTE, {
			route_name: 'Tuesday north, revised',
			route_type: 'trap',
		});

		expect(changesOf(command)).toEqual({ routeName: 'Tuesday north, revised' });
	});

	it('treats a withheld acknowledgement as withheld and nothing else as consent', () => {
		// Deleting a route deletes its stops. `false` is the client saying it has
		// not told the user yet; absent is the reading the existing endpoints
		// already use, which is that it has.
		const withheld = build(routes, 'fieldWork.deleteRoute', ROUTE, {
			acknowledgedRouteItemDeletion: false,
		});
		const given = build(routes, 'fieldWork.deleteRoute', ROUTE, {});

		expect(withheld.payload).toMatchObject({ acknowledgedRouteItemDeletion: false });
		expect(given.payload).toMatchObject({ acknowledgedRouteItemDeletion: true });
	});

	it('carries a move as a sequence stated on the route', () => {
		const command = build(routes, 'fieldWork.moveRouteItems', ROUTE, {
			route_item_ids: [ROUTE_ITEM, OTHER_ROUTE_ITEM],
			placement: { kind: 'start' },
		});

		expect(command.payload).toMatchObject({
			routeId: ROUTE,
			routeItemIds: [ROUTE_ITEM, OTHER_ROUTE_ITEM],
			placement: { kind: 'start' },
		});
	});

	it('refuses a move whose id list arrived under the wrong key', () => {
		// The silent version of this failure is a move of nothing that answers with
		// the route as though it had reordered it.
		expect(() =>
			build(routes, 'fieldWork.moveRouteItems', ROUTE, {
				routeItemIds: [ROUTE_ITEM],
				placement: { kind: 'end' },
			}),
		).toThrow(DomainValidationError);
	});

	it('leaves which placements are legal to the domain', () => {
		expect(() =>
			build(routes, 'fieldWork.moveRouteItems', ROUTE, {
				route_item_ids: [ROUTE_ITEM],
				placement: { kind: 'somewhere' },
			}),
		).toThrow(DomainValidationError);
	});

	it('accepts four intents and no more', () => {
		expect(Object.keys(routes.intents).sort()).toEqual([
			'fieldWork.createRoute',
			'fieldWork.deleteRoute',
			'fieldWork.moveRouteItems',
			'fieldWork.updateRouteDetails',
		]);
	});
});

describe('route items intent map', () => {
	it('reads the stop out of the polymorphic pair', () => {
		const command = build(routeItems, 'fieldWork.addRouteItem', ROUTE_ITEM, {
			route_id: ROUTE,
			entity_type: 'habitat',
			entity_id: HABITAT,
			directions_to_next_item: 'Left at the culvert',
		});

		expect(command.payload).toMatchObject({
			routeItemId: ROUTE_ITEM,
			routeId: ROUTE,
			target: { type: 'habitat', id: HABITAT },
			directionsToNextItem: 'Left at the culvert',
		});
	});

	it('appends when the body names no placement', () => {
		// Absent means append, which is the domain builder's own default. The reader
		// leaves the key out rather than sending it as undefined, and the two are the
		// same to `input.placement ?? { kind: 'end' }`, so what this pins is the
		// answer and not which of the two the reader sent.
		const command = build(routeItems, 'fieldWork.addRouteItem', ROUTE_ITEM, {
			route_id: ROUTE,
			entity_type: 'trap',
			entity_id: HABITAT,
		});

		expect(command.payload).toMatchObject({ placement: { kind: 'end' } });
	});

	it('ignores the position a client drew', () => {
		// A client holds a `position` for the row it drew optimistically. The server
		// derives the stored one from `placement`, so the column is not read.
		const command = build(routeItems, 'fieldWork.addRouteItem', ROUTE_ITEM, {
			route_id: ROUTE,
			entity_type: 'trap',
			entity_id: HABITAT,
			position: 3,
		});

		expect(command.payload).not.toHaveProperty('position');
		expect(command.payload).toMatchObject({ placement: { kind: 'end' } });
	});

	it('refuses a target a route may not hold', () => {
		// A Service Request is a stop an Assignment takes and a Route does not. The
		// list is the domain's, which is why the reader casts rather than narrows.
		expect(() =>
			build(routeItems, 'fieldWork.addRouteItem', ROUTE_ITEM, {
				route_id: ROUTE,
				entity_type: 'service_request',
				entity_id: SERVICE_REQUEST,
			}),
		).toThrow(DomainValidationError);
	});

	it('clears directions when an update sends none', () => {
		// Directions are the only column an update touches, so a save that omits
		// them is a save that cleared them.
		const cleared = build(routeItems, 'fieldWork.updateRouteItem', ROUTE_ITEM, {});

		expect(changesOf(cleared)).toEqual({ directionsToNextItem: null });
	});

	it('removes a stop by id alone', () => {
		const command = build(routeItems, 'fieldWork.removeRouteItem', ROUTE_ITEM, {
			route_id: ROUTE,
		});

		expect(command.payload).toMatchObject({ routeItemId: ROUTE_ITEM });
		expect(command.payload).not.toHaveProperty('routeId');
	});

	it('accepts three intents and no move', () => {
		expect(Object.keys(routeItems.intents).sort()).toEqual([
			'fieldWork.addRouteItem',
			'fieldWork.removeRouteItem',
			'fieldWork.updateRouteItem',
		]);
	});
});

describe('assignments intent map', () => {
	it('reads a new assignment off column names', () => {
		const command = build(assignments, 'fieldWork.createAssignment', ASSIGNMENT, {
			assignment_date: '2026-08-10',
			assignment_name: 'North loop',
			assigned_to_profile_id: PROFILE,
			due_at: '2026-08-10T17:00:00.000Z',
		});

		expect(command.payload).toMatchObject({
			assignmentId: ASSIGNMENT,
			assignmentDate: '2026-08-10',
			assignmentName: 'North loop',
			assignedToProfileId: PROFILE,
			dueAt: new Date('2026-08-10T17:00:00.000Z'),
		});
	});

	it('refuses the same body keyed camelCase', () => {
		expect(() =>
			build(assignments, 'fieldWork.createAssignment', ASSIGNMENT, {
				assignmentDate: '2026-08-10',
				assignedToProfileId: PROFILE,
			}),
		).toThrow(DomainValidationError);
	});

	it('pairs each new stop with the route stop it copies', () => {
		const command = build(assignments, 'fieldWork.createAssignmentFromRoute', ASSIGNMENT, {
			route_id: ROUTE,
			assignment_date: '2026-08-10',
			assignment_items: [
				{ id: ASSIGNMENT_ITEM, route_item_id: ROUTE_ITEM },
				{ id: OTHER_ASSIGNMENT_ITEM, route_item_id: OTHER_ROUTE_ITEM },
			],
		});

		expect(command.payload).toMatchObject({
			routeId: ROUTE,
			assignmentItemIds: [
				{ assignmentItemId: ASSIGNMENT_ITEM, routeItemId: ROUTE_ITEM },
				{ assignmentItemId: OTHER_ASSIGNMENT_ITEM, routeItemId: OTHER_ROUTE_ITEM },
			],
		});
	});

	it('refuses a stop list keyed the way the domain names it', () => {
		// The list is keyed for the rows it becomes, not for the argument it fills.
		// Read wrong, every entry is a pair of empty strings, and the domain refuses
		// them rather than the server copying a route as an empty worklist.
		expect(() =>
			build(assignments, 'fieldWork.createAssignmentFromRoute', ASSIGNMENT, {
				route_id: ROUTE,
				assignment_date: '2026-08-10',
				assignment_items: [{ assignmentItemId: ASSIGNMENT_ITEM, routeItemId: ROUTE_ITEM }],
			}),
		).toThrow(DomainValidationError);
	});

	it('takes no date, name or assignee when a technician picks a route up', () => {
		const command = build(assignments, 'fieldWork.selfAssignRoute', ASSIGNMENT, {
			route_id: ROUTE,
			assignment_date: '2026-08-10',
			assigned_to_profile_id: PROFILE,
			assignment_items: [{ id: ASSIGNMENT_ITEM, route_item_id: ROUTE_ITEM }],
		});

		expect(command.payload).toMatchObject({ assignmentId: ASSIGNMENT, routeId: ROUTE });
		expect(command.payload).not.toHaveProperty('assignmentDate');
		expect(command.payload).not.toHaveProperty('assignedToProfileId');
	});

	it('changes only the details the body named', () => {
		// A rename must not unassign the crew or clear the due time. The domain
		// reads `changes` by key, so absent and present-and-undefined are the same
		// to it, which is why this asserts on the key set.
		const command = build(assignments, 'fieldWork.updateAssignmentDetails', ASSIGNMENT, {
			assignment_name: 'North loop, revised',
		});

		expect(Object.keys(changesOf(command))).toEqual(['assignmentName']);
	});

	it('unassigns only when the body sent the column as null', () => {
		const command = build(assignments, 'fieldWork.updateAssignmentDetails', ASSIGNMENT, {
			assigned_to_profile_id: null,
		});

		expect(changesOf(command)).toEqual({ assignedToProfileId: null });
	});

	it('dates a lifecycle move from its own column and nothing else', () => {
		// Each of the four reads one column, and only for when the work happened,
		// which is what a device that was offline has to be able to state.
		const started = build(assignments, 'fieldWork.startAssignment', ASSIGNMENT, {
			started_at: '2026-08-10T13:00:00.000Z',
			completed_at: '2026-08-10T18:00:00.000Z',
		});

		expect(started.type).toBe('fieldWork.startAssignment');
		expect(started.payload).toMatchObject({ startedAt: new Date('2026-08-10T13:00:00.000Z') });
		expect(started.payload).not.toHaveProperty('completedAt');
	});

	it('carries no moment when a lifecycle column is absent', () => {
		// Null rather than a timestamp: an online client sends nothing and the
		// writer stamps the row. Only a device that recorded the work offline states
		// the moment itself.
		const completed = build(assignments, 'fieldWork.completeAssignment', ASSIGNMENT, {});

		expect(completed.payload).toMatchObject({ completedAt: null });
	});

	it('cancels with the reason the body carried', () => {
		const command = build(assignments, 'fieldWork.cancelAssignment', ASSIGNMENT, {
			cancelled_at: '2026-08-10T13:00:00.000Z',
			cancellation_reason: 'Truck down',
		});

		expect(command.payload).toMatchObject({
			cancelledAt: new Date('2026-08-10T13:00:00.000Z'),
			cancellationReason: 'Truck down',
		});
	});

	it('reopens without reading a timestamp', () => {
		// The whole reason the four names exist. A reopen sent from an edit form
		// carries the row as it stands, including a `started_at` the crew set this
		// morning, and reading either closing column here is how a reopen becomes a
		// day that never started.
		const command = build(assignments, 'fieldWork.reopenAssignment', ASSIGNMENT, {
			started_at: null,
			completed_at: null,
			cancelled_at: null,
		});

		expect(command.type).toBe('fieldWork.reopenAssignment');
		expect(command.payload).toEqual({
			organizationId: ORGANIZATION,
			actorProfileId: ACTOR,
			assignmentId: ASSIGNMENT,
		});
	});

	it('reads a delete acknowledgement the same way a route does', () => {
		// Deleting an assignment deletes its stops. `false` is the client saying it
		// has not told the user yet, and anything else is consent, so a wrong key
		// here reads as consent nobody gave and the day's stops go with the row.
		const withheld = build(assignments, 'fieldWork.deleteAssignment', ASSIGNMENT, {
			acknowledgedAssignmentItemDeletion: false,
		});
		const given = build(assignments, 'fieldWork.deleteAssignment', ASSIGNMENT, {});

		expect(withheld.payload).toMatchObject({ acknowledgedAssignmentItemDeletion: false });
		expect(given.payload).toMatchObject({ acknowledgedAssignmentItemDeletion: true });
	});

	it('carries a move as a sequence stated on the assignment', () => {
		const command = build(assignments, 'fieldWork.moveAssignmentItems', ASSIGNMENT, {
			assignment_item_ids: [ASSIGNMENT_ITEM, OTHER_ASSIGNMENT_ITEM],
			placement: { kind: 'after', assignmentItemId: ASSIGNMENT_ITEM },
		});

		expect(command.payload).toMatchObject({
			assignmentItemIds: [ASSIGNMENT_ITEM, OTHER_ASSIGNMENT_ITEM],
			placement: { kind: 'after', assignmentItemId: ASSIGNMENT_ITEM },
		});
	});

	it('accepts ten intents, each naming what it does', () => {
		expect(Object.keys(assignments.intents).sort()).toEqual([
			'fieldWork.cancelAssignment',
			'fieldWork.completeAssignment',
			'fieldWork.createAssignment',
			'fieldWork.createAssignmentFromRoute',
			'fieldWork.deleteAssignment',
			'fieldWork.moveAssignmentItems',
			'fieldWork.reopenAssignment',
			'fieldWork.selfAssignRoute',
			'fieldWork.startAssignment',
			'fieldWork.updateAssignmentDetails',
		]);
	});
});

describe('assignment items intent map', () => {
	it('turns the column spelling of a target back into the domain one', () => {
		// `entity_type` holds `service_request` and the domain target type is
		// `serviceRequest`. A client writing through a sync collection sends the
		// column, so the bridge is what stands between a stop on a Service Request
		// and a refusal naming a type nobody typed.
		const command = build(assignmentItems, 'fieldWork.addAssignmentItem', ASSIGNMENT_ITEM, {
			assignment_id: ASSIGNMENT,
			entity_type: 'service_request',
			entity_id: SERVICE_REQUEST,
		});

		expect(command.payload).toMatchObject({
			assignmentItemId: ASSIGNMENT_ITEM,
			assignmentId: ASSIGNMENT,
			target: { type: 'serviceRequest', id: SERVICE_REQUEST },
		});
	});

	it('honours a caller that already speaks the domain', () => {
		// Converting a value with no underscores changes nothing, so a caller
		// sending the camelCase form is read the same way.
		const command = build(assignmentItems, 'fieldWork.addAssignmentItem', ASSIGNMENT_ITEM, {
			assignment_id: ASSIGNMENT,
			entity_type: 'serviceRequest',
			entity_id: SERVICE_REQUEST,
		});

		expect(command.payload).toMatchObject({ target: { type: 'serviceRequest' } });
	});

	it('never stamps the crew from the body', () => {
		// The `*_by_profile_id` columns are the server's, off the authenticated
		// actor. A body naming someone else is not read.
		const command = build(assignmentItems, 'fieldWork.completeAssignmentItem', ASSIGNMENT_ITEM, {
			completed_at: '2026-08-10T14:00:00.000Z',
			completed_by_profile_id: PROFILE,
		});

		expect(command.payload).toMatchObject({
			actorProfileId: ACTOR,
			completedAt: new Date('2026-08-10T14:00:00.000Z'),
		});
		expect(command.payload).not.toHaveProperty('completedByProfileId');
	});

	it('names done and skipped rather than reading which column moved', () => {
		// The old PATCH checked `skipped_at` first, so a skipped stop being
		// completed was read as skip-then-complete and stayed skipped. All three
		// bodies here carry both columns, and only the name decides.
		const body = { completed_at: '2026-08-10T14:00:00.000Z', skipped_at: null };
		const completed = build(
			assignmentItems,
			'fieldWork.completeAssignmentItem',
			ASSIGNMENT_ITEM,
			body,
		);
		const reopened = build(
			assignmentItems,
			'fieldWork.reopenAssignmentItem',
			ASSIGNMENT_ITEM,
			body,
		);
		const unskipped = build(
			assignmentItems,
			'fieldWork.unskipAssignmentItem',
			ASSIGNMENT_ITEM,
			body,
		);

		expect(completed.type).toBe('fieldWork.completeAssignmentItem');
		expect(reopened.type).toBe('fieldWork.reopenAssignmentItem');
		expect(unskipped.type).toBe('fieldWork.unskipAssignmentItem');
		expect(reopened.payload).not.toHaveProperty('completedAt');
		expect(unskipped.payload).not.toHaveProperty('skippedAt');
	});

	it('refuses a skip with no reason', () => {
		// A stop passed over without a reason is a hole in the day nobody can
		// account for later, and a wrong key here is exactly that hole.
		expect(() =>
			build(assignmentItems, 'fieldWork.skipAssignmentItem', ASSIGNMENT_ITEM, {
				skipped_at: '2026-08-10T14:00:00.000Z',
				skipReason: 'Gate locked',
			}),
		).toThrow(DomainValidationError);
	});

	it('skips with the reason the body carried', () => {
		const command = build(assignmentItems, 'fieldWork.skipAssignmentItem', ASSIGNMENT_ITEM, {
			skipped_at: '2026-08-10T14:00:00.000Z',
			skip_reason: 'Gate locked',
		});

		expect(command.payload).toMatchObject({
			skippedAt: new Date('2026-08-10T14:00:00.000Z'),
			skipReason: 'Gate locked',
		});
	});

	it('clears directions when an update sends none', () => {
		// Directions are the only column an update touches, the same as on a route
		// stop, so a save that omits them is a save that cleared them.
		const cleared = build(assignmentItems, 'fieldWork.updateAssignmentItem', ASSIGNMENT_ITEM, {});

		expect(changesOf(cleared)).toEqual({ directionsToNextItem: null });
	});

	it('keeps the directions the body carried', () => {
		const command = build(assignmentItems, 'fieldWork.updateAssignmentItem', ASSIGNMENT_ITEM, {
			directions_to_next_item: 'Park on the gravel apron',
		});

		expect(changesOf(command)).toEqual({ directionsToNextItem: 'Park on the gravel apron' });
	});

	it('removes a stop by id alone', () => {
		const command = build(assignmentItems, 'fieldWork.removeAssignmentItem', ASSIGNMENT_ITEM, {
			assignment_id: ASSIGNMENT,
		});

		expect(command.payload).toEqual({
			organizationId: ORGANIZATION,
			actorProfileId: ACTOR,
			assignmentItemId: ASSIGNMENT_ITEM,
		});
	});

	it('accepts seven intents, and recording the work is not one of them', () => {
		// The four `*ForAssignmentItem` commands write a record and close the stop,
		// so they belong to the tables that hold the record (ADR 0012).
		expect(Object.keys(assignmentItems.intents).sort()).toEqual([
			'fieldWork.addAssignmentItem',
			'fieldWork.completeAssignmentItem',
			'fieldWork.removeAssignmentItem',
			'fieldWork.reopenAssignmentItem',
			'fieldWork.skipAssignmentItem',
			'fieldWork.unskipAssignmentItem',
			'fieldWork.updateAssignmentItem',
		]);
	});
});
