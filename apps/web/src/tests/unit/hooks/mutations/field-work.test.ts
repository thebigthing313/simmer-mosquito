/** @vitest-environment jsdom */

/**
 * What a field-work write dispatches: routes, worklists and the stops on both.
 *
 * Two pairs of tables shaped the same way, so most of the file is about which
 * command a click means. The endpoints these replaced read `started_at`,
 * `completed_at` and `skipped_at` and inferred the transition from which had
 * moved, which is how an edit that normalised a timestamp back to null could
 * reopen finished work with nobody asking for it. Every write here names its
 * direction, and nothing else in this app asserts that it named the right one.
 *
 * Reordering posts rather than dispatches, because a move is one command on the
 * parent. It is asserted on the wire for that reason: the count of requests is
 * the point, and a move that sent one request per row would look identical at
 * the handoff. See `dispatch-harness.ts` for why the two seams differ.
 */

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const PROFILE = '22222222-2222-4222-8222-222222222222';
const ROUTE = '33333333-3333-4333-8333-333333333333';
const ASSIGNMENT = '44444444-4444-4444-8444-444444444444';
const STOP = '55555555-5555-4555-8555-555555555555';
const HABITAT = '66666666-6666-4666-8666-666666666666';
const REQUEST = '77777777-7777-4777-8777-777777777777';
const CREW = '88888888-8888-4888-8888-888888888888';
const OTHER_CREW = '99999999-9999-4999-8999-999999999999';
const LINK = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_LINK = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SOURCE_REDUCTION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

vi.mock('../../../../lib/collections/mutate', async () => {
	const { recordDispatch } = await import('./dispatch-harness');
	return { mutateCollection: recordDispatch };
});
vi.mock('../../../../hooks/use-auth-snapshot', () => ({
	useAuthSnapshot: () => ({
		authenticated: true,
		localIdentity: { organizationId: ORGANIZATION, profileId: PROFILE },
	}),
}));

const {
	commandUrl,
	dispatches,
	firstAttempt,
	lastChanges,
	lastIntents,
	lastRow,
	lastRequest,
	lastWrite,
	requests,
	resetDispatches,
	stubApi,
} = await import('./dispatch-harness');
const { assignment_items } = await import('../../../../lib/collections/assignment_items');
const { route_items } = await import('../../../../lib/collections/route_items');
const { ASSIGNMENT_DELETE_REFUSALS, ROUTE_DELETE_REFUSALS } = await import(
	'../../../../lib/acknowledgement-copy'
);
const { useRouteMutations } = await import('../../../../hooks/mutations/use-route-mutations');
const { useRouteItemMutations } = await import(
	'../../../../hooks/mutations/use-route-item-mutations'
);
const { useAssignmentMutations } = await import(
	'../../../../hooks/mutations/use-assignment-mutations'
);
const { useAssignmentItemMutations } = await import(
	'../../../../hooks/mutations/use-assignment-item-mutations'
);
const { useAdditionalPersonnelMutations } = await import(
	'../../../../hooks/mutations/use-additional-personnel-mutations'
);

beforeEach(() => {
	installMemoryCollections();
	resetDispatches();
	stubApi();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('a route write', () => {
	it('names the create and hands back the id it minted', async () => {
		// The create dialog navigates straight to the new route's edit page, so a
		// returned id that is not the one written lands on a route that does not
		// exist yet.
		const { result } = renderHook(() => useRouteMutations());

		const routeId = await result.current.create({
			routeName: 'North basins',
			routeType: 'habitat',
		});

		expect(lastIntents()).toEqual(['fieldWork.createRoute']);
		expect(lastRow().id).toBe(routeId);
		expect(lastRow().route_type).toBe('habitat');
	});

	it('names the rename and moves the name alone', async () => {
		const { result } = renderHook(() => useRouteMutations());

		await result.current.rename(ROUTE, 'South basins');

		expect(lastIntents()).toEqual(['fieldWork.updateRouteDetails']);
		expect(lastChanges().route_name).toBe('South basins');
		expect(Object.keys(lastChanges())).not.toContain('route_type');
	});

	it('names the delete and withholds the flag over the stops on it', async () => {
		// deleteRegistry. Deleting a route takes its stops; assignments already cut
		// from it are untouched. The registry counts the stops behind a flag the
		// server reads as confirmed unless it arrives as `false`, so withholding it
		// is what makes the server count at all.
		const { result } = renderHook(() => useRouteMutations());

		await firstAttempt(ROUTE_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(ROUTE, acknowledgements),
		);

		expect(lastIntents()).toEqual(['fieldWork.deleteRoute']);
		expect(lastWrite().acknowledgements).toEqual({ acknowledgedRouteItemDeletion: false });
	});
});

describe('reordering a route', () => {
	it('posts one command on the route, naming the stop moved and where it lands', async () => {
		seedRows(route_items, [
			{ id: 'route-a', position: 0 },
			{ id: 'route-b', position: 1 },
			{ id: 'route-c', position: 2 },
		]);
		const { result } = renderHook(() => useRouteMutations());

		await result.current.moveStops(ROUTE, {
			order: ['route-a', 'route-c', 'route-b'],
			movedId: 'route-c',
			placement: { kind: 'before', anchorId: 'route-b' },
		});

		expect(requests()).toHaveLength(1);
		expect(lastRequest().url).toBe(commandUrl('routes', ROUTE));
		expect(lastRequest().method).toBe('PATCH');
		expect(lastRequest().body).toMatchObject({
			intents: ['fieldWork.moveRouteItems'],
			route_item_ids: ['route-c'],
			// The shared planner calls the anchor `anchorId`; each command renames it
			// for the table it moves, and this is the only place that rename is read.
			placement: { kind: 'before', routeItemId: 'route-b' },
		});
		expect(dispatches()).toHaveLength(0);
	});

	it('stays one request when the restack rewrites every row', async () => {
		// The gap between `gap-b` and `gap-c` cannot hold another value at double
		// precision, so the plan renumbers all four rows rather than subdividing.
		// Four optimistic mutations, still one command: the request count is what
		// separates a command on the parent from a loop over the stops.
		seedRows(route_items, [
			{ id: 'gap-a', position: 0 },
			{ id: 'gap-b', position: 1 },
			{ id: 'gap-c', position: 1 + Number.EPSILON },
			{ id: 'gap-d', position: 3 },
		]);
		const { result } = renderHook(() => useRouteMutations());

		await result.current.moveStops(ROUTE, {
			order: ['gap-a', 'gap-b', 'gap-d', 'gap-c'],
			movedId: 'gap-d',
			placement: { kind: 'before', anchorId: 'gap-c' },
		});

		expect(requests()).toHaveLength(1);
		expect(lastRequest().body).toMatchObject({ route_item_ids: ['gap-d'] });
	});

	it('sends nothing when the plan names a stop the list does not hold', async () => {
		// TanStack DB completes a transaction with no mutations without ever calling
		// its `mutationFn`, so a plan that writes no row is not a failed request but
		// no request, resolving as a success.
		// Positions well away from their index, so an implementation that renumbered
		// the list rather than planning the move would have a row to write and this
		// would see a request.
		seedRows(route_items, [
			{ id: 'held-a', position: 5 },
			{ id: 'held-b', position: 9 },
		]);
		const { result } = renderHook(() => useRouteMutations());

		await result.current.moveStops(ROUTE, {
			order: ['held-a', 'held-b'],
			movedId: 'never-synced',
			placement: { kind: 'end' },
		});

		expect(requests()).toHaveLength(0);
		expect(dispatches()).toHaveLength(0);
	});
});

describe('a route stop write', () => {
	it('names the add and writes the target in the column spelling', async () => {
		const { result } = renderHook(() => useRouteItemMutations());

		await result.current.addStop({
			routeId: ROUTE,
			target: { type: 'trap', id: STOP },
			position: 4,
		});

		expect(lastIntents()).toEqual(['fieldWork.addRouteItem']);
		expect(lastRow().entity_type).toBe('trap');
		expect(lastRow().entity_id).toBe(STOP);
		expect(lastRow().position).toBe(4);
	});

	it('names the annotation, and blank directions clear the column', async () => {
		// A crew reading "" between two stops is reading a note somebody wrote. The
		// column is nullable so that never happens.
		const { result } = renderHook(() => useRouteItemMutations());

		await result.current.setDirections(STOP, '  Left at the culvert.  ');
		expect(lastIntents()).toEqual(['fieldWork.updateRouteItem']);
		expect(lastChanges().directions_to_next_item).toBe('Left at the culvert.');

		await result.current.setDirections(STOP, '   ');
		expect(lastChanges().directions_to_next_item).toBeNull();
	});

	it('names the removal', async () => {
		const { result } = renderHook(() => useRouteItemMutations());

		await result.current.removeStop(STOP);

		expect(lastIntents()).toEqual(['fieldWork.removeRouteItem']);
	});
});

function assignmentDetails() {
	return {
		assignmentDate: '2026-08-03',
		assignmentName: 'Tuesday north',
		assignedToProfileId: PROFILE,
		dueAt: null,
	};
}

describe('an assignment write', () => {
	it('names the create and starts the worklist in none of its end states', async () => {
		const { result } = renderHook(() => useAssignmentMutations());

		await result.current.create(ASSIGNMENT, assignmentDetails());

		expect(lastIntents()).toEqual(['fieldWork.createAssignment']);
		expect(lastRow().started_at).toBeNull();
		expect(lastRow().completed_at).toBeNull();
		expect(lastRow().cancelled_at).toBeNull();
	});

	it('posts a snapshot off a route as one command carrying every stop', async () => {
		// The page navigates to the new worklist as soon as this resolves, so an
		// assignment that arrived without its stops would land on an empty planning
		// surface and read as a snapshot that failed.
		const { result } = renderHook(() => useAssignmentMutations());

		await result.current.createFromRoute({
			assignmentId: ASSIGNMENT,
			routeId: ROUTE,
			details: assignmentDetails(),
			stops: [
				{
					routeItemId: 'route-stop-1',
					assignmentItemId: 'copied-1',
					entityType: 'habitat',
					entityId: HABITAT,
					directionsToNextItem: null,
				},
				{
					routeItemId: 'route-stop-2',
					assignmentItemId: 'copied-2',
					entityType: 'trap',
					entityId: STOP,
					directionsToNextItem: 'Left at the culvert.',
				},
			],
		});

		expect(requests()).toHaveLength(1);
		expect(lastRequest().url).toBe(commandUrl('assignments'));
		expect(lastRequest().method).toBe('POST');
		expect(lastRequest().body).toMatchObject({
			intents: ['fieldWork.createAssignmentFromRoute'],
			id: ASSIGNMENT,
			route_id: ROUTE,
		});
		// Only the id each stop takes and the route item it copies: the target and
		// the directions are read off the route server-side, and restating them here
		// would be the client deciding what the snapshot says.
		expect(lastRequest().body.assignment_items).toEqual([
			{ id: 'copied-1', route_item_id: 'route-stop-1' },
			{ id: 'copied-2', route_item_id: 'route-stop-2' },
		]);
		expect(dispatches()).toHaveLength(0);
	});

	it('names the details save and leaves the lifecycle columns alone', async () => {
		// The plan page saves details and the run page starts and finishes, so a
		// details save that touched a timestamp would be this layer deciding a
		// transition nobody asked for.
		const { result } = renderHook(() => useAssignmentMutations());

		await result.current.updateDetails(ASSIGNMENT, assignmentDetails());

		expect(lastIntents()).toEqual(['fieldWork.updateAssignmentDetails']);
		expect(lastChanges().assignment_date).toBe('2026-08-03');
		expect(Object.keys(lastChanges())).not.toContain('started_at');
		expect(Object.keys(lastChanges())).not.toContain('completed_at');
		expect(Object.keys(lastChanges())).not.toContain('cancelled_at');
	});

	it('names each lifecycle direction and moves only that direction', async () => {
		const { result } = renderHook(() => useAssignmentMutations());

		await result.current.start(ASSIGNMENT);
		expect(lastIntents()).toEqual(['fieldWork.startAssignment']);
		expect(lastChanges().started_at).toBeInstanceOf(Date);
		expect(Object.keys(lastChanges())).not.toContain('completed_at');

		await result.current.complete(ASSIGNMENT);
		expect(lastIntents()).toEqual(['fieldWork.completeAssignment']);
		expect(lastChanges().completed_at).toBeInstanceOf(Date);

		await result.current.cancel(ASSIGNMENT, 'Rained out.');
		expect(lastIntents()).toEqual(['fieldWork.cancelAssignment']);
		expect(lastChanges().cancelled_at).toBeInstanceOf(Date);
		expect(lastChanges().cancellation_reason).toBe('Rained out.');
	});

	it('reopens without touching when the crew started', async () => {
		// Issue #38. Reopening resumes work rather than resetting it, and nothing
		// else on the row records when the crew actually started, so nulling
		// `started_at` here would show "Not started" until sync corrected it.
		const { result } = renderHook(() => useAssignmentMutations());

		await result.current.reopen(ASSIGNMENT);

		expect(lastIntents()).toEqual(['fieldWork.reopenAssignment']);
		expect(lastChanges().completed_at).toBeNull();
		expect(lastChanges().cancelled_at).toBeNull();
		expect(lastChanges().cancellation_reason).toBeNull();
		expect(Object.keys(lastChanges())).not.toContain('started_at');
	});

	it('backdates the lifecycle moment it sends', async () => {
		// Issue #37. `started_at` reaches the wire and the server validates it
		// against its own clock with no tolerance, so a browser running a couple of
		// seconds fast has every Start refused as being in the future. `updated_at`
		// is stripped from the body and is stamped at the real moment.
		const { result } = renderHook(() => useAssignmentMutations());

		await result.current.start(ASSIGNMENT);

		const startedAt = lastChanges().started_at as Date;
		const updatedAt = lastChanges().updated_at as Date;
		expect(updatedAt.getTime() - startedAt.getTime()).toBeGreaterThanOrEqual(1_000);
	});

	it('names the delete and withholds the flag over the stops on it', async () => {
		const { result } = renderHook(() => useAssignmentMutations());

		await firstAttempt(ASSIGNMENT_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(ASSIGNMENT, acknowledgements),
		);

		expect(lastIntents()).toEqual(['fieldWork.deleteAssignment']);
		expect(lastWrite().acknowledgements).toEqual({ acknowledgedAssignmentItemDeletion: false });
	});
});

describe('reordering a worklist', () => {
	it('posts one command on the assignment, naming the stop moved and where it lands', async () => {
		seedRows(assignment_items, [
			{ id: 'work-a', position: 0 },
			{ id: 'work-b', position: 1 },
			{ id: 'work-c', position: 2 },
		]);
		const { result } = renderHook(() => useAssignmentMutations());

		await result.current.moveStops(ASSIGNMENT, {
			order: ['work-b', 'work-a', 'work-c'],
			movedId: 'work-b',
			placement: { kind: 'before', anchorId: 'work-a' },
		});

		expect(requests()).toHaveLength(1);
		expect(lastRequest().url).toBe(commandUrl('assignments', ASSIGNMENT));
		expect(lastRequest().method).toBe('PATCH');
		expect(lastRequest().body).toMatchObject({
			intents: ['fieldWork.moveAssignmentItems'],
			assignment_item_ids: ['work-b'],
			// The shared planner calls the anchor `anchorId`; each command renames it
			// for the table it moves, and this is the only place that rename is read.
			placement: { kind: 'before', assignmentItemId: 'work-a' },
		});
		expect(dispatches()).toHaveLength(0);
	});

	it('stays one request when the restack rewrites every row', async () => {
		// Same gap as the route case: `work-gap-b` and `work-gap-c` are adjacent at
		// double precision, so the plan renumbers all four rows. Four optimistic
		// mutations, still one command.
		seedRows(assignment_items, [
			{ id: 'work-gap-a', position: 0 },
			{ id: 'work-gap-b', position: 1 },
			{ id: 'work-gap-c', position: 1 + Number.EPSILON },
			{ id: 'work-gap-d', position: 3 },
		]);
		const { result } = renderHook(() => useAssignmentMutations());

		await result.current.moveStops(ASSIGNMENT, {
			order: ['work-gap-a', 'work-gap-b', 'work-gap-d', 'work-gap-c'],
			movedId: 'work-gap-d',
			placement: { kind: 'before', anchorId: 'work-gap-c' },
		});

		expect(requests()).toHaveLength(1);
		expect(lastRequest().body).toMatchObject({ assignment_item_ids: ['work-gap-d'] });
	});

	it('sends an end placement with nothing but its kind', async () => {
		// Top and Bottom have no anchor, so an anchor key on one would be this layer
		// naming a stop the move does not depend on.
		seedRows(assignment_items, [
			{ id: 'ends-a', position: 0 },
			{ id: 'ends-b', position: 1 },
		]);
		const { result } = renderHook(() => useAssignmentMutations());

		await result.current.moveStops(ASSIGNMENT, {
			order: ['ends-b', 'ends-a'],
			movedId: 'ends-a',
			placement: { kind: 'end' },
		});

		expect(lastRequest().body.placement).toEqual({ kind: 'end' });
	});

	it('sends nothing when the plan names a stop the worklist does not hold', async () => {
		seedRows(assignment_items, [
			{ id: 'kept-a', position: 5 },
			{ id: 'kept-b', position: 9 },
		]);
		const { result } = renderHook(() => useAssignmentMutations());

		await result.current.moveStops(ASSIGNMENT, {
			order: ['kept-a', 'kept-b'],
			movedId: 'never-synced',
			placement: { kind: 'end' },
		});

		expect(requests()).toHaveLength(0);
		expect(dispatches()).toHaveLength(0);
	});
});

describe('a worklist stop write', () => {
	it('names the add and writes a two-word target in the column spelling', async () => {
		// `service_request` is the member that makes this load-bearing. The other two
		// are single words either way, so an inline camelCase comparison looks right
		// until the first request stop reloads.
		const { result } = renderHook(() => useAssignmentItemMutations());

		await result.current.addStop({
			assignmentId: ASSIGNMENT,
			target: { type: 'service_request', id: REQUEST },
			position: 2,
		});

		expect(lastIntents()).toEqual(['fieldWork.addAssignmentItem']);
		expect(lastRow().entity_type).toBe('service_request');
		expect(lastRow().entity_id).toBe(REQUEST);
		expect(lastRow().position).toBe(2);
	});

	it('names the annotation, and blank directions clear the column', async () => {
		const { result } = renderHook(() => useAssignmentItemMutations());

		await result.current.setDirections(STOP, '  Gate code 4412.  ');
		expect(lastIntents()).toEqual(['fieldWork.updateAssignmentItem']);
		expect(lastChanges().directions_to_next_item).toBe('Gate code 4412.');

		await result.current.setDirections(STOP, '');
		expect(lastChanges().directions_to_next_item).toBeNull();
	});

	it('names the removal', async () => {
		const { result } = renderHook(() => useAssignmentItemMutations());

		await result.current.removeStop(STOP);

		expect(lastIntents()).toEqual(['fieldWork.removeAssignmentItem']);
	});

	it('completes a stop and clears any skip it was carrying', async () => {
		// Completing a stop that had been skipped is a legal path, and the old
		// endpoint read `skipped_at` before `completed_at`, so it stayed skipped on
		// screen until sync corrected it.
		const { result } = renderHook(() => useAssignmentItemMutations());

		await result.current.complete(STOP);

		expect(lastIntents()).toEqual(['fieldWork.completeAssignmentItem']);
		expect(lastChanges().completed_at).toBeInstanceOf(Date);
		expect(lastChanges().completed_by_profile_id).toBe(PROFILE);
		expect(lastChanges().skipped_at).toBeNull();
		expect(lastChanges().skip_reason).toBeNull();
	});

	it('reopens a stop without unskipping it', async () => {
		// Complete and Skip are exclusive on the row, so a reopen that also cleared
		// the skip columns would answer a question the click did not ask.
		const { result } = renderHook(() => useAssignmentItemMutations());

		await result.current.reopen(STOP);

		expect(lastIntents()).toEqual(['fieldWork.reopenAssignmentItem']);
		expect(lastChanges().completed_at).toBeNull();
		expect(lastChanges().completed_by_profile_id).toBeNull();
		expect(Object.keys(lastChanges())).not.toContain('skipped_at');
		expect(Object.keys(lastChanges())).not.toContain('skip_reason');
	});

	it('skips a stop with its reason and clears any completion it was carrying', async () => {
		const { result } = renderHook(() => useAssignmentItemMutations());

		await result.current.skip(STOP, 'Gate locked.');

		expect(lastIntents()).toEqual(['fieldWork.skipAssignmentItem']);
		expect(lastChanges().skipped_at).toBeInstanceOf(Date);
		expect(lastChanges().skipped_by_profile_id).toBe(PROFILE);
		expect(lastChanges().skip_reason).toBe('Gate locked.');
		expect(lastChanges().completed_at).toBeNull();
	});

	it('unskips a stop without completing it', async () => {
		const { result } = renderHook(() => useAssignmentItemMutations());

		await result.current.unskip(STOP);

		expect(lastIntents()).toEqual(['fieldWork.unskipAssignmentItem']);
		expect(lastChanges().skipped_at).toBeNull();
		expect(lastChanges().skip_reason).toBeNull();
		expect(Object.keys(lastChanges())).not.toContain('completed_at');
	});
});

describe('a crew write', () => {
	it('names the attach and converts a two-word target to the column spelling', async () => {
		const { result } = renderHook(() => useAdditionalPersonnelMutations());

		await result.current.attach({ type: 'sourceReduction', id: SOURCE_REDUCTION }, CREW);

		expect(lastIntents()).toEqual(['fieldWork.addAdditionalPersonnel']);
		expect(lastRow().entity_type).toBe('source_reduction');
		expect(lastRow().entity_id).toBe(SOURCE_REDUCTION);
		expect(lastRow().personnel_profile_id).toBe(CREW);
	});

	it('names the detach', async () => {
		const { result } = renderHook(() => useAdditionalPersonnelMutations());

		await result.current.detach(LINK);

		expect(lastIntents()).toEqual(['fieldWork.removeAdditionalPersonnel']);
		expect(lastWrite().key).toBe(LINK);
	});

	it('saves a changed selection as one detach and one attach', async () => {
		// A link row carries nothing of its own, so there is no edit: whoever left
		// is deleted and whoever arrived is inserted. The rows that survive are not
		// rewritten, which is what keeps their audit columns still.
		const { result } = renderHook(() => useAdditionalPersonnelMutations());

		await result.current.setPersonnel({
			target: { type: 'inspection', id: STOP },
			existing: [
				{ id: LINK, personnelProfileId: CREW },
				{ id: OTHER_LINK, personnelProfileId: OTHER_CREW },
			],
			profileIds: [OTHER_CREW, PROFILE],
		});

		expect(dispatches()).toHaveLength(2);
		expect(dispatches().map((dispatch) => dispatch.write.intent)).toEqual([
			'fieldWork.removeAdditionalPersonnel',
			'fieldWork.addAdditionalPersonnel',
		]);
		expect(dispatches()[0]?.write.key).toBe(LINK);
		expect(lastRow().personnel_profile_id).toBe(PROFILE);
	});

	it('dispatches nothing when the selection matched what was already attached', async () => {
		const { result } = renderHook(() => useAdditionalPersonnelMutations());

		await result.current.setPersonnel({
			target: { type: 'inspection', id: STOP },
			existing: [{ id: LINK, personnelProfileId: CREW }],
			profileIds: [CREW],
		});

		expect(dispatches()).toHaveLength(0);
	});
});
