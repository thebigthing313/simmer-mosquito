import { checkedValues, sql } from '@simmer-mosquito/db';
import { type FieldWorkCommand, toDbEntityType } from '@simmer-mosquito/domain';
import { nextItemPosition } from '../../ordered-items.js';
import { returnColumns } from '../../return-columns.js';
import { assertItemProgress } from './assignment-lifecycle.js';
import {
	type AssignmentItemRow,
	assignmentPlacementRef,
	type FieldWorkTransaction,
	softDelete,
	updateRow,
} from './shared.js';

// ===========================================================================
// Assignment items
// ===========================================================================

export async function writeAssignmentItemCommand(
	trx: FieldWorkTransaction,
	command: FieldWorkCommand,
): Promise<AssignmentItemRow | null> {
	switch (command.type) {
		case 'fieldWork.addAssignmentItem': {
			const position = await nextItemPosition(
				trx,
				{
					table: 'assignment_items',
					parentColumn: 'assignment_id',
					parentId: command.payload.assignmentId,
					organizationId: command.payload.organizationId,
				},
				command.payload.assignmentItemId,
				{
					kind: command.payload.placement.kind,
					refId: assignmentPlacementRef(command.payload.placement),
				},
			);
			await trx
				.insertInto('assignment_items')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
						id: command.payload.assignmentItemId,
						organization_id: command.payload.organizationId,
						assignment_id: command.payload.assignmentId,
						entity_type: toDbEntityType(command.payload.target.type),
						entity_id: command.payload.target.id,
						position,
						directions_to_next_item: command.payload.directionsToNextItem,
						created_by_profile_id: command.payload.actorProfileId,
						updated_by_profile_id: command.payload.actorProfileId,
					}),
				)
				.execute();
			return loadAssignmentItem(
				trx,
				command.payload.assignmentItemId,
				command.payload.organizationId,
			);
		}
		case 'fieldWork.updateAssignmentItem':
			return updateRow(
				trx,
				'assignment_items',
				command.payload.assignmentItemId,
				command.payload.organizationId,
				{
					...('directionsToNextItem' in command.payload.changes
						? { directions_to_next_item: command.payload.changes.directionsToNextItem ?? null }
						: {}),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				returnColumns.assignment_items,
			);
		case 'fieldWork.completeAssignmentItem':
			await assertItemProgress(
				trx,
				command.payload.assignmentItemId,
				command.payload.organizationId,
				'complete',
				command.payload.completedAt,
			);
			return updateRow(
				trx,
				'assignment_items',
				command.payload.assignmentItemId,
				command.payload.organizationId,
				{
					completed_at:
						command.payload.completedAt === null ? sql`now()` : command.payload.completedAt,
					completed_by_profile_id: command.payload.actorProfileId,
					skipped_at: null,
					skipped_by_profile_id: null,
					skip_reason: null,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				returnColumns.assignment_items,
			);
		case 'fieldWork.reopenAssignmentItem':
			await assertItemProgress(
				trx,
				command.payload.assignmentItemId,
				command.payload.organizationId,
				// Reopening clears the completion rather than dating it, so there is no
				// device timestamp for the start-time rule to judge.
				'reopen',
				null,
			);
			return updateRow(
				trx,
				'assignment_items',
				command.payload.assignmentItemId,
				command.payload.organizationId,
				{
					completed_at: null,
					completed_by_profile_id: null,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				returnColumns.assignment_items,
			);
		case 'fieldWork.skipAssignmentItem':
			await assertItemProgress(
				trx,
				command.payload.assignmentItemId,
				command.payload.organizationId,
				'skip',
				command.payload.skippedAt,
			);
			return updateRow(
				trx,
				'assignment_items',
				command.payload.assignmentItemId,
				command.payload.organizationId,
				{
					skipped_at: command.payload.skippedAt === null ? sql`now()` : command.payload.skippedAt,
					skipped_by_profile_id: command.payload.actorProfileId,
					skip_reason: command.payload.skipReason,
					completed_at: null,
					completed_by_profile_id: null,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				returnColumns.assignment_items,
			);
		case 'fieldWork.unskipAssignmentItem':
			await assertItemProgress(
				trx,
				command.payload.assignmentItemId,
				command.payload.organizationId,
				'unskip',
				null,
			);
			return updateRow(
				trx,
				'assignment_items',
				command.payload.assignmentItemId,
				command.payload.organizationId,
				{
					skipped_at: null,
					skipped_by_profile_id: null,
					skip_reason: null,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				returnColumns.assignment_items,
			);
		case 'fieldWork.removeAssignmentItem':
			return softDelete(
				trx,
				'assignment_items',
				command.payload.assignmentItemId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				returnColumns.assignment_items,
			);
		default:
			throw new Error(`Unsupported assignment item command: ${command.type}`);
	}
}

async function loadAssignmentItem(
	trx: FieldWorkTransaction,
	assignmentItemId: string,
	organizationId: string,
): Promise<AssignmentItemRow | null> {
	const row = await trx
		.selectFrom('assignment_items')
		.select(returnColumns.assignment_items)
		.where('id', '=', assignmentItemId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	return row ?? null;
}
