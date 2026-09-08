/**
 * A mission: planned, scheduled, dispatched, and closed out.
 *
 * ## Five update commands, and a save names the ones it means
 *
 * The plan, the schedule, the assignee and the notification type are four
 * separate commands against one row, each with its own guards — moving a window
 * after notifications have gone out asks a different question from renaming.
 * The old endpoint worked out which of them a save meant by looking at the keys
 * that arrived, so a form that submitted every field it held issued four
 * commands and answered all four guards on the user's behalf.
 *
 * {@link MissionMutations.updateDetails} takes the whole form and works out
 * which commands the *change* means, which is this folder's job. A save that
 * moved nothing but the name is one command, and the schedule guards are never
 * reached.
 *
 * ## Cancelling and reopening write a comment
 *
 * Both carry the words explaining themselves plus a client-generated id for the
 * comment they become — a row SIMMER writes carries its own id so a retry cannot
 * insert it twice. Neither is a column here, so both travel as command
 * arguments. Reopening matters most: it *clears* the terminal columns, so
 * without the comment a reopened mission would carry no trace of having been
 * closed or why it was picked back up.
 *
 * Reordering stops is here rather than in `use-mission-item-mutations.ts`: it
 * restacks the worklist and is a command on the mission, as it is on a
 * route and an assignment.
 */

import type { MultiRowCommandType } from '@simmer-mosquito/domain';
import { type Mission as MissionRow, settleWrite } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { type MovePlan, planStopPositions } from '../../components/stop-order';
import { mission_items } from '../../lib/collections/mission_items';
import { missions } from '../../lib/collections/missions';
import { mutateCollection } from '../../lib/collections/mutate';
import { commandTransaction } from '../../lib/collections/transact';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { lifecycleStamp, newRecordId, optimisticStamp } from './shared';

/**
 * The planning fields a write takes.
 *
 * Not the form's own `MissionPlan`, which holds the schedule as the date/time
 * trio a dispatcher types; this is what that parses to, in the vocabulary the
 * command speaks.
 */
export interface MissionPlanInput {
	readonly controlType: MissionRow['control_type'];
	readonly missionName: string | null;
	readonly plannedMethodId: string | null;
	readonly assignedToProfileId: string | null;
	readonly scheduledStartAt: Date;
	readonly scheduledEndAt: Date | null;
	/** A `date` column: the day it names, not an instant. */
	readonly rainDate: string | null;
	readonly notificationTypeId: string | null;
}

export interface MissionMutations {
	readonly create: (missionId: string, plan: MissionPlanInput) => Promise<void>;
	/**
	 * Save an edited plan.
	 *
	 * Takes the plan as it stands beside the edited one, so it can name only the
	 * commands the edit actually means. A save that changed nothing sends nothing.
	 *
	 * Both sides are the same shape on purpose: the comparison is between what the
	 * user is saving and what is stored, and a form holding one and a row holding
	 * the other is how a field gets compared against the wrong column.
	 */
	readonly updateDetails: (
		missionId: string,
		plan: MissionPlanInput,
		current: MissionPlanInput,
	) => Promise<void>;
	readonly start: (missionId: string) => Promise<void>;
	readonly complete: (missionId: string) => Promise<void>;
	readonly cancel: (missionId: string, cancellationReason: string) => Promise<void>;
	/** The reason is required: a mission reopened silently is a hole in its record. */
	readonly reopen: (missionId: string, reopenReason: string) => Promise<void>;
	/**
	 * Takes its stops with it. The requests those stops named are untouched.
	 *
	 * `acknowledgements` is what the user answered. Withheld flags go on the wire
	 * as `false`, which is the only reading that makes the registry refuse.
	 */
	readonly remove: (
		missionId: string,
		acknowledgements?: Readonly<Record<string, boolean>>,
	) => Promise<void>;
	readonly moveStops: (missionId: string, plan: MovePlan) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

function missionPlacement(placement: MovePlan['placement']): Record<string, unknown> {
	return placement.kind === 'before' || placement.kind === 'after'
		? { kind: placement.kind, missionItemId: placement.anchorId }
		: { kind: placement.kind };
}

/** Two instants as the same moment, either of which may be absent. */
function sameInstant(left: Date | null, right: Date | null): boolean {
	if (left === null || right === null) {
		return left === right;
	}
	return left.getTime() === right.getTime();
}

export function useMissionMutations(): MissionMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const create = useCallback(
		async (missionId: string, plan: MissionPlanInput) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}

			const now = optimisticStamp();
			const mission: MissionRow = {
				id: missionId,
				organization_id: organizationId,
				mission_name: plan.missionName,
				control_type: plan.controlType,
				planned_method_id: plan.plannedMethodId,
				assigned_to_profile_id: plan.assignedToProfileId,
				// Mirrors what the server stamps, so the row does not change under the
				// list a moment after it appears.
				assigned_by_profile_id: plan.assignedToProfileId === null ? null : actorProfileId,
				scheduled_start_at: plan.scheduledStartAt,
				scheduled_end_at: plan.scheduledEndAt,
				rain_date: plan.rainDate,
				started_at: null,
				completed_at: null,
				cancelled_at: null,
				cancellation_reason: null,
				notification_type_id: plan.notificationTypeId,
				created_by_profile_id: actorProfileId,
				updated_by_profile_id: actorProfileId,
				created_at: now,
				updated_at: now,
			};

			// A transaction rather than `mutateCollection`, because the command may
			// carry the stops the mission is planned around — `mission_items` in the
			// payload, one Postgres transaction. This app does not use that half yet:
			// a mission is planned empty and its stops are added on the detail page,
			// which is a legal plan the domain accepts and simply refuses to start.
			// The type is what puts it here regardless, and it is right to: a create
			// that grew stops and stayed a single-row write would land the mission and
			// leave its stops off the screen.
			await settleWrite(
				commandTransaction({
					intent: 'missionDispatch.createMission' satisfies MultiRowCommandType,
					request: {
						table: 'missions',
						method: 'POST',
						body: {
							id: missionId,
							mission_name: plan.missionName,
							control_type: plan.controlType,
							planned_method_id: plan.plannedMethodId,
							assigned_to_profile_id: plan.assignedToProfileId,
							scheduled_start_at: plan.scheduledStartAt,
							scheduled_end_at: plan.scheduledEndAt,
							rain_date: plan.rainDate,
							notification_type_id: plan.notificationTypeId,
						},
					},
					apply: () => {
						missions().insert(mission);
					},
				}),
			);
		},
		[organizationId, actorProfileId],
	);

	const updateDetails = useCallback(
		async (missionId: string, plan: MissionPlanInput, current: MissionPlanInput) => {
			// Which commands this save means, decided by what moved. Naming one the
			// change set has nothing for is refused by the domain, so a form that
			// always named all four would fail the moment a user touched one group.
			const intents: (
				| 'missionDispatch.updateMissionDetails'
				| 'missionDispatch.updateMissionSchedule'
				| 'missionDispatch.updateMissionPlan'
				| 'missionDispatch.assignMission'
				| 'missionDispatch.updateMissionNotificationType'
			)[] = [];
			const changes: Partial<MissionRow> = {};

			if (plan.missionName !== current.missionName) {
				intents.push('missionDispatch.updateMissionDetails');
				changes.mission_name = plan.missionName;
			}

			if (
				!sameInstant(plan.scheduledStartAt, current.scheduledStartAt) ||
				!sameInstant(plan.scheduledEndAt, current.scheduledEndAt) ||
				plan.rainDate !== current.rainDate
			) {
				intents.push('missionDispatch.updateMissionSchedule');
				changes.scheduled_start_at = plan.scheduledStartAt;
				changes.scheduled_end_at = plan.scheduledEndAt;
				changes.rain_date = plan.rainDate;
			}

			if (
				plan.controlType !== current.controlType ||
				plan.plannedMethodId !== current.plannedMethodId
			) {
				intents.push('missionDispatch.updateMissionPlan');
				changes.control_type = plan.controlType;
				changes.planned_method_id = plan.plannedMethodId;
			}

			if (plan.assignedToProfileId !== current.assignedToProfileId) {
				intents.push('missionDispatch.assignMission');
				changes.assigned_to_profile_id = plan.assignedToProfileId;
				// Mirrored the way the server stamps it: who handed the work over is
				// recorded by the act of handing it over.
				changes.assigned_by_profile_id = plan.assignedToProfileId === null ? null : actorProfileId;
			}

			if (plan.notificationTypeId !== current.notificationTypeId) {
				intents.push('missionDispatch.updateMissionNotificationType');
				changes.notification_type_id = plan.notificationTypeId;
			}

			if (intents.length === 0) {
				return;
			}

			await settleWrite(
				mutateCollection(missions(), {
					operation: 'update',
					intent: intents,
					key: missionId,
					changes: {
						...changes,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const start = useCallback(
		async (missionId: string) => {
			await settleWrite(
				mutateCollection(missions(), {
					operation: 'update',
					intent: 'missionDispatch.startMission',
					key: missionId,
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
		async (missionId: string) => {
			await settleWrite(
				mutateCollection(missions(), {
					operation: 'update',
					intent: 'missionDispatch.completeMission',
					key: missionId,
					changes: {
						completed_at: lifecycleStamp(),
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
					// `started_at` is deliberately not written here. The server stamps
					// whatever start it settles on for a mission finished straight from
					// scheduled, and guessing at it would show a start that is not the
					// stored one until sync corrected it.
					arguments: { autoStartMission: true },
				}),
			);
		},
		[actorProfileId],
	);

	const cancel = useCallback(
		async (missionId: string, cancellationReason: string) => {
			await settleWrite(
				mutateCollection(missions(), {
					operation: 'update',
					intent: 'missionDispatch.cancelMission',
					key: missionId,
					changes: {
						cancelled_at: lifecycleStamp(),
						cancellation_reason: cancellationReason,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
					// The comment the reason becomes. Minted here so a retry writes the
					// same comment rather than a second one.
					arguments: { cancellationCommentId: newRecordId() },
				}),
			);
		},
		[actorProfileId],
	);

	const reopen = useCallback(
		async (missionId: string, reopenReason: string) => {
			await settleWrite(
				mutateCollection(missions(), {
					operation: 'update',
					intent: 'missionDispatch.reopenMission',
					key: missionId,
					changes: {
						completed_at: null,
						cancelled_at: null,
						cancellation_reason: null,
						// `started_at` is deliberately left alone. The server keeps it:
						// reopening resumes work rather than resetting it, and nothing else
						// on the row records when the crew actually started.
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
					arguments: { reopenCommentId: newRecordId(), reopenReason },
				}),
			);
		},
		[actorProfileId],
	);

	const remove = useCallback(
		async (missionId: string, acknowledgements: Readonly<Record<string, boolean>> = {}) => {
			await settleWrite(
				mutateCollection(missions(), {
					operation: 'delete',
					intent: 'missionDispatch.deleteMission',
					key: missionId,
					// A delete carries no row and no changed fields, so an acknowledgement
					// is the only thing it can say beyond the command's name.
					acknowledgements,
				}),
			);
		},
		[],
	);

	const moveStops = useCallback(async (missionId: string, plan: MovePlan) => {
		await settleWrite(
			commandTransaction({
				intent: 'missionDispatch.moveMissionItems' satisfies MultiRowCommandType,
				request: {
					table: 'missions',
					method: 'PATCH',
					key: missionId,
					body: {
						mission_item_ids: [plan.movedId],
						placement: missionPlacement(plan.placement),
					},
				},
				// The same arithmetic the server runs, so the optimistic rows carry the
				// numbers that stream back and nothing shifts twice on screen. An empty
				// `apply` would be worse than useless: TanStack DB completes a
				// transaction with no mutations without calling its `mutationFn`, so the
				// request would never leave the browser. A move always rewrites at least
				// the row it moved, which is why that cannot happen here.
				apply: () => {
					const positions = planStopPositions(plan, (id) => mission_items().get(id)?.position);
					for (const [missionItemId, position] of positions) {
						mission_items().update(missionItemId, (draft) => {
							draft.position = position;
						});
					}
				},
			}),
		);
	}, []);

	return {
		create,
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
