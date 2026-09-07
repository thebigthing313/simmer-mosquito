import { applyRecordDeletion, checkedValues, sql } from '@simmer-mosquito/db';
import type { FieldWorkCommand } from '@simmer-mosquito/domain';
import { moveItems } from '../../ordered-items.js';
import {
	assertAssignmentTransition,
	checkCompleteAssignment,
	checkReopenAssignment,
	checkStartAssignment,
} from './assignment-lifecycle.js';
import {
	type AssignmentRow,
	assignmentPlacementRef,
	assignmentReturnColumns,
	type FieldWorkTransaction,
	localDateColumn,
	nowLocalDate,
	softDelete,
	updateRow,
} from './shared.js';

// ===========================================================================
// Assignments
// ===========================================================================

export async function writeAssignmentCommand(
	trx: FieldWorkTransaction,
	command: FieldWorkCommand,
): Promise<AssignmentRow | null> {
	switch (command.type) {
		case 'fieldWork.createAssignment':
			return insertAssignment(trx, command.payload);
		case 'fieldWork.createAssignmentFromRoute': {
			const assignment = await insertAssignment(trx, command.payload);
			await copyRouteItemsToAssignment(
				trx,
				command.payload.organizationId,
				command.payload.routeId,
				command.payload.assignmentId,
				command.payload.assignmentItemIds,
				command.payload.actorProfileId,
			);
			return assignment;
		}
		case 'fieldWork.selfAssignRoute': {
			const assignment = await insertAssignment(trx, {
				...command.payload,
				assignmentDate: nowLocalDate(),
				assignmentName: null,
				assignedToProfileId: command.payload.actorProfileId,
				dueAt: null,
			});
			await copyRouteItemsToAssignment(
				trx,
				command.payload.organizationId,
				command.payload.routeId,
				command.payload.assignmentId,
				command.payload.assignmentItemIds,
				command.payload.actorProfileId,
			);
			return assignment;
		}
		case 'fieldWork.updateAssignmentDetails': {
			const changes = command.payload.changes;
			return updateRow(
				trx,
				'assignments',
				command.payload.assignmentId,
				command.payload.organizationId,
				{
					...('assignmentDate' in changes && changes.assignmentDate !== undefined
						? { assignment_date: localDateColumn(changes.assignmentDate) }
						: {}),
					...('assignmentName' in changes
						? { assignment_name: changes.assignmentName ?? null }
						: {}),
					...('assignedToProfileId' in changes
						? { assigned_to_profile_id: changes.assignedToProfileId ?? null }
						: {}),
					...('dueAt' in changes ? { due_at: changes.dueAt ?? null } : {}),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				assignmentReturnColumns,
			);
		}
		case 'fieldWork.startAssignment':
			await assertAssignmentTransition(
				trx,
				command.payload.assignmentId,
				command.payload.organizationId,
				checkStartAssignment,
			);
			return updateRow(
				trx,
				'assignments',
				command.payload.assignmentId,
				command.payload.organizationId,
				{
					started_at: command.payload.startedAt === null ? sql`now()` : command.payload.startedAt,
					assigned_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				assignmentReturnColumns,
			);
		case 'fieldWork.completeAssignment':
			await assertAssignmentTransition(
				trx,
				command.payload.assignmentId,
				command.payload.organizationId,
				checkCompleteAssignment,
			);
			return updateRow(
				trx,
				'assignments',
				command.payload.assignmentId,
				command.payload.organizationId,
				{
					completed_at:
						command.payload.completedAt === null ? sql`now()` : command.payload.completedAt,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				assignmentReturnColumns,
			);
		case 'fieldWork.cancelAssignment':
			return updateRow(
				trx,
				'assignments',
				command.payload.assignmentId,
				command.payload.organizationId,
				{
					cancelled_at:
						command.payload.cancelledAt === null ? sql`now()` : command.payload.cancelledAt,
					cancellation_reason: command.payload.cancellationReason,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				assignmentReturnColumns,
			);
		case 'fieldWork.reopenAssignment':
			await assertAssignmentTransition(
				trx,
				command.payload.assignmentId,
				command.payload.organizationId,
				checkReopenAssignment,
			);
			// `started_at` deliberately survives: reopening resumes work rather than
			// resetting it, so an assignment that had been started comes back as in
			// progress. Nothing else on the row records when the crew actually
			// started, so clearing it would discard that for good.
			return updateRow(
				trx,
				'assignments',
				command.payload.assignmentId,
				command.payload.organizationId,
				{
					completed_at: null,
					cancelled_at: null,
					cancellation_reason: null,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				assignmentReturnColumns,
			);
		case 'fieldWork.deleteAssignment':
			await applyRecordDeletion(trx, {
				recordType: 'assignment',
				recordId: command.payload.assignmentId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				acknowledged: {
					acknowledgedAssignmentItemDeletion: command.payload.acknowledgedAssignmentItemDeletion,
				},
			});
			return softDelete(
				trx,
				'assignments',
				command.payload.assignmentId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				assignmentReturnColumns,
			);
		case 'fieldWork.moveAssignmentItems': {
			await moveItems(
				trx,
				{
					table: 'assignment_items',
					parentColumn: 'assignment_id',
					parentId: command.payload.assignmentId,
					organizationId: command.payload.organizationId,
				},
				command.payload.assignmentItemIds,
				{
					kind: command.payload.placement.kind,
					refId: assignmentPlacementRef(command.payload.placement),
				},
				command.payload.actorProfileId,
			);
			return loadAssignment(trx, command.payload.assignmentId, command.payload.organizationId);
		}
		default:
			throw new Error(`Unsupported assignment command: ${command.type}`);
	}
}

async function insertAssignment(
	trx: FieldWorkTransaction,
	payload: {
		readonly assignmentId: string;
		readonly organizationId: string;
		readonly assignmentDate: string;
		readonly assignmentName: string | null;
		readonly assignedToProfileId: string | null;
		readonly dueAt: Date | null;
		readonly actorProfileId: string;
	},
): Promise<AssignmentRow> {
	const row = await trx
		.insertInto('assignments')
		.values(
			await checkedValues(trx, payload.organizationId, {
				id: payload.assignmentId,
				organization_id: payload.organizationId,
				assignment_name: payload.assignmentName,
				assigned_to_profile_id: payload.assignedToProfileId,
				assigned_by_profile_id: payload.actorProfileId,
				assignment_date: localDateColumn(payload.assignmentDate),
				due_at: payload.dueAt,
				created_by_profile_id: payload.actorProfileId,
				updated_by_profile_id: payload.actorProfileId,
			}),
		)
		.returning(assignmentReturnColumns)
		.executeTakeFirstOrThrow();
	return row;
}

async function copyRouteItemsToAssignment(
	trx: FieldWorkTransaction,
	organizationId: string,
	routeId: string,
	assignmentId: string,
	mappings: readonly { readonly routeItemId: string; readonly assignmentItemId: string }[],
	actorProfileId: string,
): Promise<void> {
	const routeItems = await trx
		.selectFrom('route_items')
		.select(['id', 'entity_type', 'entity_id', 'directions_to_next_item'])
		.where('route_id', '=', routeId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.orderBy('position', 'asc')
		.execute();
	const byRouteItem = new Map(mappings.map((m) => [m.routeItemId, m.assignmentItemId]));
	let position = 0;
	for (const routeItem of routeItems) {
		const assignmentItemId = byRouteItem.get(routeItem.id);
		if (assignmentItemId === undefined) {
			continue;
		}
		await trx
			.insertInto('assignment_items')
			.values(
				await checkedValues(trx, organizationId, {
					id: assignmentItemId,
					organization_id: organizationId,
					assignment_id: assignmentId,
					entity_type: routeItem.entity_type,
					entity_id: routeItem.entity_id,
					position,
					directions_to_next_item: routeItem.directions_to_next_item,
					created_by_profile_id: actorProfileId,
					updated_by_profile_id: actorProfileId,
				}),
			)
			.execute();
		position += 1;
	}
}

async function loadAssignment(
	trx: FieldWorkTransaction,
	assignmentId: string,
	organizationId: string,
): Promise<AssignmentRow | null> {
	const row = await trx
		.selectFrom('assignments')
		.select(assignmentReturnColumns)
		.where('id', '=', assignmentId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	return row ?? null;
}
