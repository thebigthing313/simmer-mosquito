/**
 * The `mission_items` table, as commands.
 *
 * One stop on a mission: a piece of ground the crew will treat, and where the
 * crew has got to with it. Eight commands — two ways to add a stop, one to move
 * its location or what it is linked to, one to drop it, and the four that say
 * how it went.
 *
 * Reordering is not here: see `missions.ts`, and `routes.ts` for the reasoning.
 * Neither are the four `record*ForMissionItem` commands, which write a Chemical
 * Application or a Source Reduction *and* close the stop that produced it — they
 * belong to the tables those records land in, the way the `*ForAssignmentItem`
 * commands do (ADR 0012).
 *
 * ## Two adds, because there are two things a stop can be
 *
 * A stop is either ground somebody picked, or a Requested Control Action being
 * scheduled. The old POST told them apart by looking: a `requestedControlActionId`
 * with no location meant the second, anything else meant the first. That reading
 * has no way to say "this action's request, but treat *this* ground instead" —
 * the moment a caller states a location, the link stops being what the stop is
 * drawn from and becomes a field beside it. Two names, and the caller says which.
 *
 * ## `position` is not a field a client sets
 *
 * The server derives the new stop's position from `placement`, so `placement`
 * is an instruction rather than a column and the row's own `position` is
 * ignored. A
 * client may still send one — it has to hold a value for the row it drew
 * optimistically — and it is simply not read. Same as `route_items`.
 *
 * ## Skipping and completing are not a timestamp moving
 *
 * The old PATCH read `completed_at` and `skipped_at` to decide which of four
 * transitions a save meant, and checked `skipped_at` first — so Complete on a
 * stop somebody had skipped was read as a skip, and the work was recorded as not
 * done. Four names replace it, and the columns are read only for *when*.
 *
 * ## Field names
 *
 * Postgres column names: `mission_id`, `address_id`,
 * `requested_control_action_id`, `completed_at`, `skipped_at`, `skip_reason`.
 * `geometry`, `locationSource` and `placement` are none of them — a stop's
 * ground is stated as a location source and stored as `geom` inside the
 * transaction, and where it goes in the order is an instruction.
 */

import {
	addMissionItemCommand,
	addMissionItemFromRequestedControlActionCommand,
	completeMissionItemCommand,
	type MissionDispatchCommand,
	type MissionItemLocationSourceInput,
	type MissionItemPlacement,
	removeMissionItemCommand,
	reopenMissionItemCommand,
	skipMissionItemCommand,
	unskipMissionItemCommand,
	updateMissionItemLocationAndLinkCommand,
} from '@simmer-mosquito/domain';
import { readNullableText, readText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import { readDate } from '../command-write.js';
import { writeMissionItemCommand } from '../mission-dispatch-commands/mission-items.js';
import type { MissionItemRow } from '../mission-dispatch-commands/shared.js';
import type { TableCommands } from './dispatch.js';
import { acknowledged } from './shared.js';

/**
 * Where a stop goes in the order, if the caller said.
 *
 * Absent means append, which is what the domain defaults to. Sending
 * `placement: undefined` would say the same thing; leaving the key out keeps the
 * builder's own default the only place that decision is made.
 */
function placementOf(payload: Record<string, unknown>): { placement?: MissionItemPlacement } {
	return payload.placement === undefined
		? {}
		: { placement: payload.placement as MissionItemPlacement };
}

/** The four flags both adds carry, which are the same four questions. */
function addAcknowledgements(payload: Record<string, unknown>) {
	return {
		acknowledgedDuplicateRequestedActionMissioning: acknowledged(
			payload.acknowledgedDuplicateRequestedActionMissioning,
		),
		acknowledgedMethodMismatch: acknowledged(payload.acknowledgedMethodMismatch),
		acknowledgedInProgressMissionChange: acknowledged(payload.acknowledgedInProgressMissionChange),
		acknowledgedNotificationGeometryChange: acknowledged(
			payload.acknowledgedNotificationGeometryChange,
		),
	};
}

export function missionItemTableCommands(
	db: CommandDb,
): TableCommands<MissionDispatchCommand, MissionItemRow> {
	return {
		table: 'mission_items',
		run: {
			db,
			write: writeMissionItemCommand,
			notFound: 'mission_item_not_found',
			key: 'missionItem',
		},
		intents: {
			'missionDispatch.addMissionItem': ({ payload, agency, id }) =>
				addMissionItemCommand({
					...agency,
					missionItemId: id,
					missionId: readText(payload.mission_id) ?? '',
					...(payload.geometry === undefined ? {} : { geometry: payload.geometry }),
					// Untyped, as a placement is: which sources a stop may be located
					// from is the domain builder's rule, and restating it here would be a
					// copy of it that could disagree.
					...(payload.locationSource === undefined
						? {}
						: { locationSource: payload.locationSource as MissionItemLocationSourceInput }),
					addressId: readNullableText(payload.address_id),
					requestedControlActionId: readNullableText(payload.requested_control_action_id),
					...placementOf(payload),
					...addAcknowledgements(payload),
				}),

			// No location of its own: the stop takes the request's, which the server
			// reads off the Requested Control Action inside the transaction.
			'missionDispatch.addMissionItemFromRequestedControlAction': ({ payload, agency, id }) =>
				addMissionItemFromRequestedControlActionCommand({
					...agency,
					missionItemId: id,
					missionId: readText(payload.mission_id) ?? '',
					requestedControlActionId: readText(payload.requested_control_action_id) ?? '',
					...placementOf(payload),
					...addAcknowledgements(payload),
				}),

			// One command for both, because they are one question: what this stop is,
			// and moving the ground without moving the link is how a stop ends up
			// treating one place while claiming to answer a request about another.
			'missionDispatch.updateMissionItemLocationAndLink': ({ payload, agency, id }) =>
				updateMissionItemLocationAndLinkCommand({
					...agency,
					missionItemId: id,
					...('geometry' in payload ? { geometry: payload.geometry } : {}),
					...('locationSource' in payload
						? { locationSource: payload.locationSource as MissionItemLocationSourceInput }
						: {}),
					...('address_id' in payload ? { addressId: readNullableText(payload.address_id) } : {}),
					...('requested_control_action_id' in payload
						? {
								requestedControlActionId: readNullableText(payload.requested_control_action_id),
							}
						: {}),
					acknowledgedNotificationGeometryChange: acknowledged(
						payload.acknowledgedNotificationGeometryChange,
					),
					acknowledgedActualActionContextChange: acknowledged(
						payload.acknowledgedActualActionContextChange,
					),
					acknowledgedProgressedItemLinkChange: acknowledged(
						payload.acknowledgedProgressedItemLinkChange,
					),
					acknowledgedMethodMismatch: acknowledged(payload.acknowledgedMethodMismatch),
					acknowledgedDuplicateRequestedActionMissioning: acknowledged(
						payload.acknowledgedDuplicateRequestedActionMissioning,
					),
				}),

			'missionDispatch.removeMissionItem': ({ payload, agency, id }) =>
				removeMissionItemCommand({
					...agency,
					missionItemId: id,
					acknowledgedItemProgressDeletion: acknowledged(payload.acknowledgedItemProgressDeletion),
					acknowledgedActualActionDetach: acknowledged(payload.acknowledgedActualActionDetach),
					acknowledgedNotificationGeometryChange: acknowledged(
						payload.acknowledgedNotificationGeometryChange,
					),
				}),

			// `autoStartMission` is not an acknowledgement: closing the first stop of a
			// mission nobody marked started is the ordinary case in the field, and this
			// says whether the server should stamp the start rather than refuse.
			'missionDispatch.completeMissionItem': ({ payload, agency, id }) =>
				completeMissionItemCommand({
					...agency,
					missionItemId: id,
					completedAt: readDate(payload.completed_at),
					autoStartMission: payload.autoStartMission === true,
					acknowledgedEarlyStart: acknowledged(payload.acknowledgedEarlyStart),
				}),

			// A skip records why. A stop that was passed over with no account of it is
			// indistinguishable from one nobody reached.
			'missionDispatch.skipMissionItem': ({ payload, agency, id }) =>
				skipMissionItemCommand({
					...agency,
					missionItemId: id,
					skippedAt: readDate(payload.skipped_at),
					skipReason: readText(payload.skip_reason) ?? '',
					autoStartMission: payload.autoStartMission === true,
					acknowledgedEarlyStart: acknowledged(payload.acknowledgedEarlyStart),
				}),

			// Both read nothing: undoing either close is clearing the columns that
			// recorded it, and which ones those are is settled by the name.
			'missionDispatch.reopenMissionItem': ({ agency, id }) =>
				reopenMissionItemCommand({ ...agency, missionItemId: id }),

			'missionDispatch.unskipMissionItem': ({ agency, id }) =>
				unskipMissionItemCommand({ ...agency, missionItemId: id }),
		},
	};
}
