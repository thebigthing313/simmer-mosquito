/**
 * One stop on a worklist: added, annotated, worked, or dropped.
 *
 * ## Done and Skipped name their transition
 *
 * Four commands rather than two columns read for which way they moved. That
 * matters most on the pair the old endpoint got wrong: it checked `skipped_at`
 * before `completed_at`, so a skipped stop that was then completed was read as a
 * skip and stayed skipped on screen until sync corrected it. Here Complete says
 * complete, and the server checks the transition against the stored row and
 * refuses a stale one.
 *
 * The `*_by_profile_id` columns are mirrored optimistically so the row does not
 * flicker between what the page wrote and what the server stamped. They never
 * reach the wire — `commandRequestFor` strips them — and the server sets them
 * from the authenticated actor.
 *
 * Reordering is not here: it renumbers the whole worklist and is a command on
 * the assignment, in `use-assignment-mutations.ts`.
 */

import { type AssignmentItem as AssignmentItemRow, settleWrite } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { assignment_items } from '../../lib/collections/assignment_items';
import { mutateCollection } from '../../lib/collections/mutate';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { lifecycleStamp, newRecordId, optimisticStamp } from './shared';

/**
 * What a stop sends a crew to.
 *
 * Written in the column's snake_case spelling, so the optimistic row and the one
 * Electric streams back are the same row. `serviceRequest` is the member that
 * makes this load-bearing — the other two are single words either way, which is
 * why an inline comparison looks right until the first request stop reloads.
 */
export interface AssignmentStopTarget {
	readonly type: 'trap' | 'habitat' | 'service_request';
	readonly id: string;
}

export interface AssignmentItemMutations {
	readonly addStop: (input: {
		readonly assignmentId: string;
		readonly target: AssignmentStopTarget;
		/** Where it lands until the server renumbers — the list's current last, plus one. */
		readonly position: number;
	}) => Promise<void>;
	/** What a crew needs between this stop and the next. Empty clears it. */
	readonly setDirections: (assignmentItemId: string, directions: string) => Promise<void>;
	readonly removeStop: (assignmentItemId: string) => Promise<void>;
	readonly complete: (assignmentItemId: string) => Promise<void>;
	readonly reopen: (assignmentItemId: string) => Promise<void>;
	/** The reason is required: a stop passed over silently is a hole in the day's record. */
	readonly skip: (assignmentItemId: string, skipReason: string) => Promise<void>;
	readonly unskip: (assignmentItemId: string) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useAssignmentItemMutations(): AssignmentItemMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const addStop = useCallback(
		async ({
			assignmentId,
			target,
			position,
		}: {
			readonly assignmentId: string;
			readonly target: AssignmentStopTarget;
			readonly position: number;
		}) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}

			const now = optimisticStamp();
			await settleWrite(
				mutateCollection(assignment_items, {
					operation: 'insert',
					intent: 'fieldWork.addAssignmentItem',
					row: {
						id: newRecordId(),
						organization_id: organizationId,
						assignment_id: assignmentId,
						entity_type: target.type,
						entity_id: target.id,
						position,
						directions_to_next_item: null,
						completed_at: null,
						completed_by_profile_id: null,
						skipped_at: null,
						skipped_by_profile_id: null,
						skip_reason: null,
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
					} satisfies AssignmentItemRow,
				}),
			);
		},
		[organizationId, actorProfileId],
	);

	const setDirections = useCallback(
		async (assignmentItemId: string, directions: string) => {
			const trimmed = directions.trim();
			await settleWrite(
				mutateCollection(assignment_items, {
					operation: 'update',
					intent: 'fieldWork.updateAssignmentItem',
					key: assignmentItemId,
					changes: {
						directions_to_next_item: trimmed.length === 0 ? null : trimmed,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const removeStop = useCallback(async (assignmentItemId: string) => {
		await settleWrite(
			mutateCollection(assignment_items, {
				operation: 'delete',
				intent: 'fieldWork.removeAssignmentItem',
				key: assignmentItemId,
			}),
		);
	}, []);

	const complete = useCallback(
		async (assignmentItemId: string) => {
			await settleWrite(
				mutateCollection(assignment_items, {
					operation: 'update',
					intent: 'fieldWork.completeAssignmentItem',
					key: assignmentItemId,
					// The skip columns are cleared here as well as server-side: completing
					// a stop that had been skipped is a legal path, and leaving the reason
					// on the row would render it as still skipped.
					changes: {
						completed_at: lifecycleStamp(),
						completed_by_profile_id: actorProfileId,
						skipped_at: null,
						skipped_by_profile_id: null,
						skip_reason: null,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const reopen = useCallback(
		async (assignmentItemId: string) => {
			await settleWrite(
				mutateCollection(assignment_items, {
					operation: 'update',
					intent: 'fieldWork.reopenAssignmentItem',
					key: assignmentItemId,
					changes: {
						completed_at: null,
						completed_by_profile_id: null,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const skip = useCallback(
		async (assignmentItemId: string, skipReason: string) => {
			await settleWrite(
				mutateCollection(assignment_items, {
					operation: 'update',
					intent: 'fieldWork.skipAssignmentItem',
					key: assignmentItemId,
					changes: {
						skipped_at: lifecycleStamp(),
						skipped_by_profile_id: actorProfileId,
						skip_reason: skipReason,
						completed_at: null,
						completed_by_profile_id: null,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const unskip = useCallback(
		async (assignmentItemId: string) => {
			await settleWrite(
				mutateCollection(assignment_items, {
					operation: 'update',
					intent: 'fieldWork.unskipAssignmentItem',
					key: assignmentItemId,
					changes: {
						skipped_at: null,
						skipped_by_profile_id: null,
						skip_reason: null,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	return {
		addStop,
		setDirections,
		removeStop,
		complete,
		reopen,
		skip,
		unskip,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}
