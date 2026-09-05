/**
 * The `assignments` table, as commands.
 *
 * A day's worklist for one person: the stops, in order, and the four timestamps
 * that say where the crew is in it. Ten commands, which is the widest map on this
 * surface, and every one of them was previously chosen by inference — see below.
 *
 * ## Lifecycle: four names, not four columns read for their direction
 *
 * The old PATCH called `readLifecycleTransition`, which looked at which of
 * `started_at`, `completed_at`, `cancelled_at` had a value and which had been
 * nulled, and picked a command from that. It is the sharpest case on the whole
 * surface for why that is the wrong question: nulling `completed_at` and nulling
 * `cancelled_at` are the same edit to the row and mean *reopen* either way, while
 * an edit form that normalised `completed_at` back to null while saving a name
 * would silently reopen a finished assignment. The names are here instead, and
 * the columns are read only for the value they carry — when the work actually
 * happened, which a device that was offline needs to be able to state.
 *
 * ## The two creates that copy a Route
 *
 * `createAssignmentFromRoute` and `selfAssignRoute` insert the assignment *and*
 * the Assignment Items copied out of a Route's stops, so they carry the child ids
 * with them, the way a Chemical Application carries its batches. The list is
 * `assignment_items`, named for the table it becomes, and each entry pairs the id
 * the client generated with the Route Item it came from — the server reads the
 * stop's target out of the Route rather than trusting a client to restate it.
 *
 * That mapping is also the membership filter: a Route Item the list does not name
 * is not copied. A client that builds it from a half-loaded subset gets a
 * silently short assignment, which is why the domain requires at least one and
 * the pages that send it gate on their route items being ready.
 *
 * `selfAssignRoute` takes no date, no name and no assignee: it is a technician
 * picking up a route now, so the server dates it today and assigns it to the
 * caller.
 *
 * ## Field names
 *
 * Postgres column names: `assignment_date`, `assignment_name`,
 * `assigned_to_profile_id`, `due_at`, `started_at`, `completed_at`,
 * `cancelled_at`, `cancellation_reason`. `route_id`, `assignment_items`,
 * `assignment_item_ids` and `placement` are not columns on this table — they are
 * what a command that reaches past its own row has to state.
 */

import {
	type AssignmentItemPlacement,
	cancelAssignmentCommand,
	completeAssignmentCommand,
	createAssignmentCommand,
	createAssignmentFromRouteCommand,
	deleteAssignmentCommand,
	type FieldWorkCommand,
	moveAssignmentItemsCommand,
	reopenAssignmentCommand,
	selfAssignRouteCommand,
	startAssignmentCommand,
	updateAssignmentDetailsCommand,
} from '@simmer-mosquito/domain';
import { type CommandPayload, isRecord, readNullableText, readText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import { readDate, readStringArray } from '../command-write.js';
import { writeAssignmentCommand } from '../field-work-commands/assignments.js';
import type { AssignmentRow } from '../field-work-commands/shared.js';
import type { TableCommands } from './dispatch.js';
import { acknowledged } from './shared.js';

/**
 * The keys an assignment write reads that are not its columns. Three name
 * another table's rows, so they stay `snake_case`; `placement` is where a move
 * plan puts the stops it names.
 */
type AssignmentArgument = 'route_id' | 'assignment_items' | 'assignment_item_ids' | 'placement';

/** The body of a write to this module's table. */
type AssignmentPayload = CommandPayload<'assignments', AssignmentArgument>;

/**
 * The Assignment Items a from-route create carries, out of the child rows the
 * client drew.
 *
 * Each entry is one new Assignment Item: `id` is the id the client generated for
 * it, `route_item_id` the stop it is a copy of. Both are the child table's own
 * column names, as `application_batches` is — a create's children are stated in
 * the vocabulary of the rows they become.
 */
function assignmentItemSources(
	payload: AssignmentPayload,
): readonly { readonly routeItemId: string; readonly assignmentItemId: string }[] {
	const entries = payload.assignment_items;
	if (!Array.isArray(entries)) {
		return [];
	}

	return entries.map((entry) => ({
		assignmentItemId: isRecord(entry) ? (readText(entry.id) ?? '') : '',
		routeItemId: isRecord(entry) ? (readText(entry.route_item_id) ?? '') : '',
	}));
}

export function assignmentTableCommands(
	db: CommandDb,
): TableCommands<'assignments', FieldWorkCommand, AssignmentRow, AssignmentArgument> {
	return {
		table: 'assignments',
		run: { db, write: writeAssignmentCommand, notFound: 'assignment_not_found', key: 'assignment' },
		intents: {
			'fieldWork.createAssignment': ({ payload, organization, id }) =>
				createAssignmentCommand({
					...organization,
					assignmentId: id,
					assignmentDate: readText(payload.assignment_date) ?? '',
					assignmentName: readNullableText(payload.assignment_name),
					assignedToProfileId: readNullableText(payload.assigned_to_profile_id),
					dueAt: readDate(payload.due_at),
				}),

			'fieldWork.createAssignmentFromRoute': ({ payload, organization, id }) =>
				createAssignmentFromRouteCommand({
					...organization,
					assignmentId: id,
					routeId: readText(payload.route_id) ?? '',
					assignmentDate: readText(payload.assignment_date) ?? '',
					assignmentName: readNullableText(payload.assignment_name),
					assignedToProfileId: readNullableText(payload.assigned_to_profile_id),
					dueAt: readDate(payload.due_at),
					assignmentItemIds: assignmentItemSources(payload),
				}),

			'fieldWork.selfAssignRoute': ({ payload, organization, id }) =>
				selfAssignRouteCommand({
					...organization,
					assignmentId: id,
					routeId: readText(payload.route_id) ?? '',
					assignmentItemIds: assignmentItemSources(payload),
				}),

			'fieldWork.updateAssignmentDetails': ({ payload, organization, id }) =>
				updateAssignmentDetailsCommand({
					...organization,
					assignmentId: id,
					...(payload.assignment_date !== undefined
						? { assignmentDate: readText(payload.assignment_date) ?? '' }
						: {}),
					...(payload.assignment_name !== undefined
						? { assignmentName: readNullableText(payload.assignment_name) }
						: {}),
					...(payload.assigned_to_profile_id !== undefined
						? { assignedToProfileId: readNullableText(payload.assigned_to_profile_id) }
						: {}),
					...(payload.due_at !== undefined ? { dueAt: readDate(payload.due_at) } : {}),
				}),

			// The four lifecycle commands read one column each, and only for *when*:
			// absent means now, which is what an online client sends. A device that
			// recorded the work offline states the moment it happened.
			'fieldWork.startAssignment': ({ payload, organization, id }) =>
				startAssignmentCommand({
					...organization,
					assignmentId: id,
					startedAt: readDate(payload.started_at),
				}),

			'fieldWork.completeAssignment': ({ payload, organization, id }) =>
				completeAssignmentCommand({
					...organization,
					assignmentId: id,
					completedAt: readDate(payload.completed_at),
				}),

			'fieldWork.cancelAssignment': ({ payload, organization, id }) =>
				cancelAssignmentCommand({
					...organization,
					assignmentId: id,
					cancelledAt: readDate(payload.cancelled_at),
					cancellationReason: readNullableText(payload.cancellation_reason),
				}),

			// Reads nothing. Which of the two closed states it is coming back from is
			// the server's to look up, and clearing both columns is the same write
			// either way.
			'fieldWork.reopenAssignment': ({ organization, id }) =>
				reopenAssignmentCommand({ ...organization, assignmentId: id }),

			'fieldWork.deleteAssignment': ({ payload, organization, id }) =>
				deleteAssignmentCommand({
					...organization,
					assignmentId: id,
					acknowledgedAssignmentItemDeletion: acknowledged(
						payload,
						'acknowledgedAssignmentItemDeletion',
					),
				}),

			// A move restacks the worklist and answers with the assignment. See
			// `routes.ts` for why that puts it on the parent.
			'fieldWork.moveAssignmentItems': ({ payload, organization, id }) =>
				moveAssignmentItemsCommand({
					...organization,
					assignmentId: id,
					assignmentItemIds: readStringArray(payload.assignment_item_ids),
					placement: payload.placement as AssignmentItemPlacement,
				}),
		},
	};
}
