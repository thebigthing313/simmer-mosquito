/**
 * Planning, running and closing a day's worklist.
 *
 * Ten commands over two tables, and the file is mostly about which of them a
 * given click means — because the endpoint no longer works that out. The old
 * PATCH read `started_at`, `completed_at` and `cancelled_at` and inferred the
 * transition from which had moved, so an edit form that normalised a timestamp
 * back to null could reopen a finished assignment without anybody asking it to.
 * Here every write says what it is.
 *
 * ## Details and lifecycle stay separate calls
 *
 * They could be one — `intents` is a list, and the server commits both in one
 * transaction. They are not, because no screen offers them together: the plan
 * page saves details, the run page starts and finishes. Naming a command a save
 * has no fields for is refused by the domain, so combining them speculatively
 * would break the moment somebody saved only a name.
 *
 * ## Snapshotting a Route
 *
 * `createFromRoute` writes the assignment *and* the stops copied off the Route,
 * as one request and N+1 optimistic rows — the page navigates straight to the
 * new worklist, so an assignment that arrived without its stops would land on an
 * empty planning surface and look like the snapshot had failed.
 *
 * The server copies only the Route Items the mapping names, so a caller building
 * it from a subset that has not finished loading gets a silently short
 * assignment. The create page gates on `isReady` for exactly that reason.
 */

import type { MultiRowCommandType } from '@simmer-mosquito/domain';
import {
	type AssignmentItem as AssignmentItemRow,
	type Assignment as AssignmentRow,
	settleWrite,
} from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { type MovePlan, planStopPositions } from '../../components/stop-order';
import { assignment_items } from '../../lib/collections/assignment_items';
import { assignments } from '../../lib/collections/assignments';
import { mutateCollection } from '../../lib/collections/mutate';
import { commandTransaction } from '../../lib/collections/transact';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { lifecycleStamp, optimisticStamp } from './shared';

/** The planning fields, as a form holds them. */
export interface AssignmentDetails {
	readonly assignmentDate: string;
	readonly assignmentName: string | null;
	readonly assignedToProfileId: string | null;
	readonly dueAt: Date | null;
}

/** One stop to copy: the Route Item it comes from, and the id it will have. */
export interface RouteStopSnapshot {
	readonly routeItemId: string;
	readonly assignmentItemId: string;
	/** The Route Item's target, so the optimistic stop points somewhere. */
	readonly entityType: string;
	readonly entityId: string;
	readonly directionsToNextItem: string | null;
}

export interface AssignmentMutations {
	readonly create: (assignmentId: string, details: AssignmentDetails) => Promise<void>;
	readonly createFromRoute: (input: {
		readonly assignmentId: string;
		readonly routeId: string;
		readonly details: AssignmentDetails;
		/** In route order — the order the server copies them in. */
		readonly stops: readonly RouteStopSnapshot[];
	}) => Promise<void>;
	readonly updateDetails: (assignmentId: string, details: AssignmentDetails) => Promise<void>;
	readonly start: (assignmentId: string) => Promise<void>;
	readonly complete: (assignmentId: string) => Promise<void>;
	readonly cancel: (assignmentId: string, cancellationReason: string | null) => Promise<void>;
	readonly reopen: (assignmentId: string) => Promise<void>;
	/**
	 * Takes its stops with it. The records those stops pointed at are untouched.
	 *
	 * `acknowledgements` is what the user answered. Withheld flags go on the wire
	 * as `false`, which is the only reading that makes the registry refuse.
	 */
	readonly remove: (
		assignmentId: string,
		acknowledgements?: Readonly<Record<string, boolean>>,
	) => Promise<void>;
	readonly moveStops: (assignmentId: string, plan: MovePlan) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

function assignmentPlacement(placement: MovePlan['placement']): Record<string, unknown> {
	return placement.kind === 'before' || placement.kind === 'after'
		? { kind: placement.kind, assignmentItemId: placement.anchorId }
		: { kind: placement.kind };
}

export function useAssignmentMutations(): AssignmentMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const newAssignmentRow = useCallback(
		(assignmentId: string, details: AssignmentDetails): AssignmentRow => {
			const now = optimisticStamp();
			return {
				id: assignmentId,
				organization_id: organizationId ?? '',
				assignment_name: details.assignmentName,
				assigned_to_profile_id: details.assignedToProfileId,
				// Mirrors what the server stamps, so the row does not change under the
				// list a moment after it appears.
				assigned_by_profile_id: actorProfileId,
				assignment_date: details.assignmentDate,
				due_at: details.dueAt,
				started_at: null,
				completed_at: null,
				cancelled_at: null,
				cancellation_reason: null,
				created_by_profile_id: actorProfileId,
				updated_by_profile_id: actorProfileId,
				created_at: now,
				updated_at: now,
			};
		},
		[organizationId, actorProfileId],
	);

	const create = useCallback(
		async (assignmentId: string, details: AssignmentDetails) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}

			await settleWrite(
				mutateCollection(assignments(), {
					operation: 'insert',
					intent: 'fieldWork.createAssignment',
					row: newAssignmentRow(assignmentId, details),
				}),
			);
		},
		[organizationId, newAssignmentRow],
	);

	const createFromRoute = useCallback(
		async ({
			assignmentId,
			routeId,
			details,
			stops,
		}: {
			readonly assignmentId: string;
			readonly routeId: string;
			readonly details: AssignmentDetails;
			readonly stops: readonly RouteStopSnapshot[];
		}) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}

			const now = optimisticStamp();
			const assignment = newAssignmentRow(assignmentId, details);

			await settleWrite(
				commandTransaction({
					intent: 'fieldWork.createAssignmentFromRoute' satisfies MultiRowCommandType,
					request: {
						table: 'assignments',
						method: 'POST',
						body: {
							id: assignmentId,
							route_id: routeId,
							assignment_date: details.assignmentDate,
							assignment_name: details.assignmentName,
							assigned_to_profile_id: details.assignedToProfileId,
							due_at: details.dueAt,
							// Named for the table they become, each entry keyed by that
							// table's own columns — the same shape a Chemical Application
							// states its batches in.
							assignment_items: stops.map((stop) => ({
								id: stop.assignmentItemId,
								route_item_id: stop.routeItemId,
							})),
						},
					},
					apply: () => {
						assignments().insert(assignment);
						stops.forEach((stop, index) => {
							assignment_items().insert({
								id: stop.assignmentItemId,
								organization_id: organizationId,
								assignment_id: assignmentId,
								entity_type: stop.entityType,
								entity_id: stop.entityId,
								position: index,
								directions_to_next_item: stop.directionsToNextItem,
								completed_at: null,
								completed_by_profile_id: null,
								skipped_at: null,
								skipped_by_profile_id: null,
								skip_reason: null,
								created_by_profile_id: actorProfileId,
								updated_by_profile_id: actorProfileId,
								created_at: now,
								updated_at: now,
							} satisfies AssignmentItemRow);
						});
					},
				}),
			);
		},
		[organizationId, actorProfileId, newAssignmentRow],
	);

	const updateDetails = useCallback(
		async (assignmentId: string, details: AssignmentDetails) => {
			await settleWrite(
				mutateCollection(assignments(), {
					operation: 'update',
					intent: 'fieldWork.updateAssignmentDetails',
					key: assignmentId,
					changes: {
						assignment_date: details.assignmentDate,
						assignment_name: details.assignmentName,
						assigned_to_profile_id: details.assignedToProfileId,
						due_at: details.dueAt,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const start = useCallback(
		async (assignmentId: string) => {
			await settleWrite(
				mutateCollection(assignments(), {
					operation: 'update',
					intent: 'fieldWork.startAssignment',
					key: assignmentId,
					changes: {
						started_at: lifecycleStamp(),
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const complete = useCallback(
		async (assignmentId: string) => {
			await settleWrite(
				mutateCollection(assignments(), {
					operation: 'update',
					intent: 'fieldWork.completeAssignment',
					key: assignmentId,
					changes: {
						completed_at: lifecycleStamp(),
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const cancel = useCallback(
		async (assignmentId: string, cancellationReason: string | null) => {
			await settleWrite(
				mutateCollection(assignments(), {
					operation: 'update',
					intent: 'fieldWork.cancelAssignment',
					key: assignmentId,
					changes: {
						cancelled_at: lifecycleStamp(),
						cancellation_reason: cancellationReason,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const reopen = useCallback(
		async (assignmentId: string) => {
			await settleWrite(
				mutateCollection(assignments(), {
					operation: 'update',
					intent: 'fieldWork.reopenAssignment',
					key: assignmentId,
					changes: {
						completed_at: null,
						cancelled_at: null,
						cancellation_reason: null,
						// `started_at` is deliberately left alone. The server keeps it
						// (issue #38) — reopening resumes work rather than resetting it, and
						// nothing else on the row records when the crew actually started.
						// Nulling it here would show "Not started" until sync corrected it.
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const remove = useCallback(
		async (assignmentId: string, acknowledgements: Readonly<Record<string, boolean>> = {}) => {
			await settleWrite(
				mutateCollection(assignments(), {
					operation: 'delete',
					intent: 'fieldWork.deleteAssignment',
					key: assignmentId,
					// A delete carries no row and no changed fields, so an acknowledgement
					// is the only thing it can say beyond the command's name.
					acknowledgements,
				}),
			);
		},
		[],
	);

	const moveStops = useCallback(async (assignmentId: string, plan: MovePlan) => {
		await settleWrite(
			commandTransaction({
				intent: 'fieldWork.moveAssignmentItems' satisfies MultiRowCommandType,
				request: {
					table: 'assignments',
					method: 'PATCH',
					key: assignmentId,
					body: {
						assignment_item_ids: [plan.movedId],
						placement: assignmentPlacement(plan.placement),
					},
				},
				// The same arithmetic the server runs, so the optimistic rows carry the
				// numbers that stream back and nothing shifts twice on screen. An empty
				// `apply` would be worse than useless: TanStack DB completes a
				// transaction with no mutations without calling its `mutationFn`, so the
				// request would never leave the browser. A move always rewrites at least
				// the row it moved, which is why that cannot happen here.
				apply: () => {
					const positions = planStopPositions(plan, (id) => assignment_items().get(id)?.position);
					for (const [assignmentItemId, position] of positions) {
						assignment_items().update(assignmentItemId, (draft) => {
							draft.position = position;
						});
					}
				},
			}),
		);
	}, []);

	return {
		create,
		createFromRoute,
		updateDetails,
		start,
		complete,
		cancel,
		reopen,
		remove,
		moveStops,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}
