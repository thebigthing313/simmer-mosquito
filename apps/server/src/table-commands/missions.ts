/**
 * The `missions` table, as commands.
 *
 * A Mission is planned control work: what will be done, where, when, and by
 * whom. Twelve commands, which makes this the widest map on the surface —
 * `assignments` had ten — and every one of them was previously chosen by
 * inference from which fields a PATCH happened to carry.
 *
 * ## Why a mission has five update commands and not one
 *
 * The old PATCH read the payload five times over and built up to five commands
 * from what it found: a `missionName` key meant `updateMissionDetails`, any of
 * three schedule keys meant `updateMissionSchedule`, and so on. That grouping is
 * real — the domain genuinely has five separate commands, because each carries
 * its own acknowledgements — but which of them a save meant was a fact about the
 * request body rather than something the client said. Here the client says it,
 * and one save that renames a mission and moves its window is
 * `intents: ['…updateMissionDetails', '…updateMissionSchedule']`.
 *
 * ## The acknowledgements are the reason this matters most here
 *
 * Mission dispatch carries more of them than any other domain: changing a
 * schedule after notifications have gone out, changing the plan on a mission
 * crews have already worked, reassigning one that is in progress. The old routes
 * hard-coded every one of them to `true` — a client could not withhold an
 * acknowledgement even in principle, so the domain's guards were dead code from
 * the route's side. `acknowledged()` reads them the way every other table does:
 * absent means confirmed, and an explicit `false` is a client saying it has not
 * asked the user yet.
 *
 * ## Cancelling and reopening write a comment
 *
 * Both take an id for the comment they write and the words to put in it. Neither
 * is a column here — `cancellation_reason` is, and it is the one snake_case key
 * of the pair — and the old routes generated the comment id with `randomUUID()`
 * server-side, which is exactly the thing that makes a retried write insert a
 * second comment. The client generates it, as it does every other id. Same
 * reading as `closeServiceRequest` in `contacts.ts`.
 *
 * ## The move lives here
 *
 * `missionDispatch.moveMissionItems` restacks the stops and answers with the
 * mission, for the reason set out at length in `routes.ts`: `position` is a fact
 * about the sequence, not about any row in it.
 *
 * ## Field names
 *
 * Postgres column names: `mission_name`, `control_type`, `planned_method_id`,
 * `assigned_to_profile_id`, `scheduled_start_at`, `scheduled_end_at`,
 * `rain_date`, `notification_type_id`, `started_at`, `completed_at`,
 * `cancelled_at`, `cancellation_reason`. `mission_items`, `mission_item_ids` and
 * `placement` are not columns on this table — they are what a command that
 * reaches past its own row has to state.
 */

import {
	assignMissionCommand,
	cancelMissionCommand,
	completeMissionCommand,
	createMissionCommand,
	deleteMissionCommand,
	type MissionDispatchCommand,
	type MissionInitialItemInput,
	type MissionItemPlacement,
	moveMissionItemsCommand,
	reopenMissionCommand,
	startMissionCommand,
	updateMissionDetailsCommand,
	updateMissionNotificationTypeCommand,
	updateMissionPlanCommand,
	updateMissionScheduleCommand,
} from '@simmer-mosquito/domain';
import { isRecord, readNullableText, readText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import { readDate, readStringArray } from '../command-write.js';
import { writeMissionCommand } from '../mission-dispatch-commands/missions.js';
import type { MissionRow } from '../mission-dispatch-commands/shared.js';
import type { TableCommands } from './dispatch.js';
import { acknowledged } from './shared.js';

/**
 * The stops a create carries, out of the child rows the client drew.
 *
 * Named `mission_items` for the table they become and keyed by that table's
 * columns, the way `application_batches` and `assignment_items` are. Two keys
 * are not columns and keep their own vocabulary: `kind`, which is the domain's
 * discriminator between a stop somebody placed and a stop drawn off a Requested
 * Control Action, and the location a stop was stated as.
 *
 * The old POST inferred `kind` — a `requestedControlActionId` with no location
 * meant one, anything else meant the other — which quietly made "this request's
 * ground, linked to that action" impossible to say. It is stated now, and the
 * domain refuses a kind it does not know.
 */
function missionInitialItems(payload: Record<string, unknown>): readonly MissionInitialItemInput[] {
	const entries = payload.mission_items;
	if (!Array.isArray(entries)) {
		return [];
	}

	return entries.map((entry) => {
		const item = isRecord(entry) ? entry : {};
		return {
			kind: item.kind,
			missionItemId: readText(item.id) ?? '',
			...(item.geometry === undefined ? {} : { geometry: item.geometry }),
			...(item.locationSource === undefined ? {} : { locationSource: item.locationSource }),
			addressId: readNullableText(item.address_id),
			requestedControlActionId: readNullableText(item.requested_control_action_id),
			// Cast for the same reason a placement is: which shapes an item may take
			// is `validateInitialItems`'s rule, and it names the one that is wrong.
		} as MissionInitialItemInput;
	});
}

export function missionTableCommands(
	db: CommandDb,
): TableCommands<MissionDispatchCommand, MissionRow> {
	return {
		table: 'missions',
		run: { db, write: writeMissionCommand, notFound: 'mission_not_found', key: 'mission' },
		intents: {
			// The only command that reads `mission_items`: a mission planned from a
			// map selection arrives with its stops, in one transaction, because a
			// mission that appeared without them would read as a failed save.
			'missionDispatch.createMission': ({ payload, agency, id }) =>
				createMissionCommand({
					...agency,
					missionId: id,
					controlType: (readText(payload.control_type) ?? '') as never,
					scheduledStartAt: readDate(payload.scheduled_start_at) ?? new Date(Number.NaN),
					missionName: readNullableText(payload.mission_name),
					plannedMethodId: readNullableText(payload.planned_method_id),
					assignedToProfileId: readNullableText(payload.assigned_to_profile_id),
					scheduledEndAt: readDate(payload.scheduled_end_at),
					rainDate: readNullableText(payload.rain_date),
					notificationTypeId: readNullableText(payload.notification_type_id),
					items: missionInitialItems(payload),
					acknowledgedDuplicateRequestedActionMissioning: acknowledged(
						payload.acknowledgedDuplicateRequestedActionMissioning,
					),
					acknowledgedMethodMismatch: acknowledged(payload.acknowledgedMethodMismatch),
				}),

			'missionDispatch.updateMissionDetails': ({ payload, agency, id }) =>
				updateMissionDetailsCommand({
					...agency,
					missionId: id,
					missionName: readNullableText(payload.mission_name),
				}),

			// The three schedule columns move together because moving any of them is
			// the same question to a crew and the same one to everybody notified.
			'missionDispatch.updateMissionSchedule': ({ payload, agency, id }) =>
				updateMissionScheduleCommand({
					...agency,
					missionId: id,
					...('scheduled_start_at' in payload
						? { scheduledStartAt: readDate(payload.scheduled_start_at) ?? new Date(Number.NaN) }
						: {}),
					...('scheduled_end_at' in payload
						? { scheduledEndAt: readDate(payload.scheduled_end_at) }
						: {}),
					...('rain_date' in payload ? { rainDate: readNullableText(payload.rain_date) } : {}),
					acknowledgedNotificationTimingChange: acknowledged(
						payload.acknowledgedNotificationTimingChange,
					),
					acknowledgedWorkedMissionScheduleChange: acknowledged(
						payload.acknowledgedWorkedMissionScheduleChange,
					),
				}),

			'missionDispatch.updateMissionPlan': ({ payload, agency, id }) =>
				updateMissionPlanCommand({
					...agency,
					missionId: id,
					...('control_type' in payload
						? { controlType: (readText(payload.control_type) ?? '') as never }
						: {}),
					...('planned_method_id' in payload
						? { plannedMethodId: readNullableText(payload.planned_method_id) }
						: {}),
					acknowledgedNotificationPlanChange: acknowledged(
						payload.acknowledgedNotificationPlanChange,
					),
					acknowledgedWorkedMissionPlanChange: acknowledged(
						payload.acknowledgedWorkedMissionPlanChange,
					),
				}),

			// Assigning is its own command rather than part of the details update: the
			// server stamps `assigned_by_profile_id` with the caller, so who handed the
			// work over is recorded by the act of handing it over.
			'missionDispatch.assignMission': ({ payload, agency, id }) =>
				assignMissionCommand({
					...agency,
					missionId: id,
					assignedToProfileId: readNullableText(payload.assigned_to_profile_id),
					acknowledgedInProgressAssignmentChange: acknowledged(
						payload.acknowledgedInProgressAssignmentChange,
					),
				}),

			'missionDispatch.updateMissionNotificationType': ({ payload, agency, id }) =>
				updateMissionNotificationTypeCommand({
					...agency,
					missionId: id,
					notificationTypeId: readNullableText(payload.notification_type_id),
					acknowledgedNotificationRegenerationImpact: acknowledged(
						payload.acknowledgedNotificationRegenerationImpact,
					),
				}),

			// The lifecycle commands read one column each, and only for *when*: absent
			// means now, which is what an online client sends. A device that recorded
			// the work offline states the moment it happened.
			'missionDispatch.startMission': ({ payload, agency, id }) =>
				startMissionCommand({
					...agency,
					missionId: id,
					startedAt: readDate(payload.started_at),
					acknowledgedEarlyStart: acknowledged(payload.acknowledgedEarlyStart),
				}),

			'missionDispatch.completeMission': ({ payload, agency, id }) =>
				completeMissionCommand({
					...agency,
					missionId: id,
					completedAt: readDate(payload.completed_at),
					// Not an acknowledgement: finishing a mission nobody marked started
					// is the ordinary case in the field, and this says whether the server
					// should stamp the start rather than refuse.
					autoStartMission: payload.autoStartMission === true,
				}),

			'missionDispatch.cancelMission': ({ payload, agency, id }) =>
				cancelMissionCommand({
					...agency,
					missionId: id,
					cancellationCommentId: readText(payload.cancellationCommentId) ?? '',
					cancellationReason: readText(payload.cancellation_reason) ?? '',
					cancelledAt: readDate(payload.cancelled_at),
					acknowledgedProgressedMissionCancellation: acknowledged(
						payload.acknowledgedProgressedMissionCancellation,
					),
					acknowledgedPartialWorkCancellation: acknowledged(
						payload.acknowledgedPartialWorkCancellation,
					),
				}),

			// Which of the two closed states it is coming back from is the server's to
			// look up; clearing both columns is the same write either way. The reason
			// is not optional, because a mission that reopened with no account of why
			// is what the next person to read it has to work from.
			'missionDispatch.reopenMission': ({ payload, agency, id }) =>
				reopenMissionCommand({
					...agency,
					missionId: id,
					reopenCommentId: readText(payload.reopenCommentId) ?? '',
					reopenReason: readText(payload.reopenReason) ?? '',
					reopenedAt: readDate(payload.reopenedAt),
				}),

			'missionDispatch.deleteMission': ({ payload, agency, id }) =>
				deleteMissionCommand({
					...agency,
					missionId: id,
					acknowledgedMissionItemDeletion: acknowledged(payload.acknowledgedMissionItemDeletion),
					acknowledgedActualActionDetach: acknowledged(payload.acknowledgedActualActionDetach),
					acknowledgedNotificationDeletion: acknowledged(payload.acknowledgedNotificationDeletion),
					acknowledgedCompletedMissionDeletion: acknowledged(
						payload.acknowledgedCompletedMissionDeletion,
					),
				}),

			// A move renumbers the whole worklist and answers with the mission — see
			// `routes.ts` for why that puts it on the parent.
			'missionDispatch.moveMissionItems': ({ payload, agency, id }) =>
				moveMissionItemsCommand({
					...agency,
					missionId: id,
					missionItemIds: readStringArray(payload.mission_item_ids),
					placement: payload.placement as MissionItemPlacement,
					acknowledgedProgressedItemReorder: acknowledged(
						payload.acknowledgedProgressedItemReorder,
					),
				}),
		},
	};
}
