/**
 * The `assignment_items` table, as commands.
 *
 * One stop on a worklist. The same polymorphic shape as `route_items` — a stop
 * points at a Trap, a Habitat or a Service Request — and, unlike a Route, an
 * Assignment mixes all three in one list by design.
 *
 * ## Done and Skipped are two states, not two columns
 *
 * `completed_at` and `skipped_at` are mutually exclusive, and the server clears
 * one when it writes the other. The old PATCH worked out which of the four
 * transitions a save meant by reading which of the two moved and in which
 * direction, checking `skipped_at` first — which meant a skipped stop offered
 * Complete would be read as skip-then-complete and stay skipped. Four names
 * remove the ordering question entirely: complete, reopen, skip, unskip.
 *
 * Each still checks the transition it names against the stored row
 * (`assertItemProgress`), so a stale screen is refused rather than committed.
 *
 * Recording the work a stop was created for is a different command again, and
 * lives with the record it produces: the four `*ForAssignmentItem` commands write
 * a Habitat Inspection or a Trap Collection *and* close the stop, which is why
 * they belong to those tables and not to this one (ADR 0012).
 *
 * ## Field names
 *
 * Postgres column names: `assignment_id`, `entity_type`, `entity_id`,
 * `directions_to_next_item`, `completed_at`, `skipped_at`, `skip_reason`. The
 * `*_by_profile_id` columns are absent: the server stamps them from the
 * authenticated actor, and a client that named someone else would be ignored.
 */

import {
	type AssignmentItemPlacement,
	type AssignmentItemTarget,
	addAssignmentItemCommand,
	completeAssignmentItemCommand,
	type FieldWorkCommand,
	removeAssignmentItemCommand,
	reopenAssignmentItemCommand,
	skipAssignmentItemCommand,
	unskipAssignmentItemCommand,
	updateAssignmentItemCommand,
} from '@simmer-mosquito/domain';
import { readNullableText, readText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import { readDate } from '../command-write.js';
import { writeAssignmentItemCommand } from '../field-work-commands/assignment-items.js';
import type { AssignmentItemRow } from '../field-work-commands/shared.js';
import type { TableCommands } from './dispatch.js';
import { readEntityTarget } from './shared.js';

/**
 * Where in the run a stop goes. Not a column: the order is a list, not a field.
 */
type AssignmentItemArgument = 'placement';

export function assignmentItemTableCommands(
	db: CommandDb,
): TableCommands<'assignment_items', FieldWorkCommand, AssignmentItemRow, AssignmentItemArgument> {
	return {
		table: 'assignment_items',
		run: {
			db,
			write: writeAssignmentItemCommand,
			notFound: 'assignment_item_not_found',
			key: 'assignmentItem',
		},
		intents: {
			'fieldWork.addAssignmentItem': ({ payload, agency, id }) =>
				addAssignmentItemCommand({
					...agency,
					assignmentItemId: id,
					assignmentId: readText(payload.assignment_id) ?? '',
					target: readEntityTarget(payload.entity_type, payload.entity_id) as AssignmentItemTarget,
					...(payload.placement === undefined
						? {}
						: { placement: payload.placement as AssignmentItemPlacement }),
					directionsToNextItem: readNullableText(payload.directions_to_next_item),
				}),

			'fieldWork.updateAssignmentItem': ({ payload, agency, id }) =>
				updateAssignmentItemCommand({
					...agency,
					assignmentItemId: id,
					directionsToNextItem: readNullableText(payload.directions_to_next_item),
				}),

			'fieldWork.completeAssignmentItem': ({ payload, agency, id }) =>
				completeAssignmentItemCommand({
					...agency,
					assignmentItemId: id,
					completedAt: readDate(payload.completed_at),
				}),

			// Reopen and unskip read nothing: they clear a state rather than date one,
			// so there is no moment for the start-time rule to judge.
			'fieldWork.reopenAssignmentItem': ({ agency, id }) =>
				reopenAssignmentItemCommand({ ...agency, assignmentItemId: id }),

			'fieldWork.skipAssignmentItem': ({ payload, agency, id }) =>
				skipAssignmentItemCommand({
					...agency,
					assignmentItemId: id,
					skippedAt: readDate(payload.skipped_at),
					// Required by the domain: a stop passed over without a reason is a hole
					// in the day's record that nobody can account for later.
					skipReason: readText(payload.skip_reason) ?? '',
				}),

			'fieldWork.unskipAssignmentItem': ({ agency, id }) =>
				unskipAssignmentItemCommand({ ...agency, assignmentItemId: id }),

			'fieldWork.removeAssignmentItem': ({ agency, id }) =>
				removeAssignmentItemCommand({ ...agency, assignmentItemId: id }),
		},
	};
}
