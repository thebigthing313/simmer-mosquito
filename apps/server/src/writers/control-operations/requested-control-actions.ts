import { applyRecordDeletion, checkedValues, sql } from '@simmer-mosquito/db';
import type { ControlOperationsCommand } from '@simmer-mosquito/domain';
import { returnColumns } from '../../return-columns.js';
import {
	type ControlOperationsTransaction,
	contextIds,
	locationContextColumns,
	type RequestedControlActionRow,
	resolveGeom,
	softDelete,
	updateActionRow,
} from './shared.js';

// ===========================================================================
// Requested control actions
// ===========================================================================

export async function writeRequestedControlActionCommand(
	trx: ControlOperationsTransaction,
	command: ControlOperationsCommand,
): Promise<RequestedControlActionRow | null> {
	switch (command.type) {
		case 'controlOperations.requestControlAction': {
			const ids = contextIds(command.payload.context);
			const row = await trx
				.insertInto('requested_control_actions')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
						id: command.payload.requestedControlActionId,
						organization_id: command.payload.organizationId,
						control_type: command.payload.controlType,
						recommended_method_id: command.payload.recommendedMethodId,
						summary: command.payload.summary,
						habitat_id: ids.habitatId,
						inspection_id: ids.inspectionId,
						collection_id: ids.collectionId,
						geom: await resolveGeom(
							trx,
							command.payload.organizationId,
							command.payload.locationSource,
						),
						address_id: command.payload.addressId,
						requested_by_profile_id: command.payload.requestedByProfileId,
						...(command.payload.requestedAt === null
							? {}
							: { requested_at: command.payload.requestedAt }),
						created_by_profile_id: command.payload.actorProfileId,
						updated_by_profile_id: command.payload.actorProfileId,
					}),
				)
				.returning(returnColumns.requested_control_actions)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'controlOperations.updateRequestedControlActionDetails': {
			const changes = command.payload.changes;
			return updateActionRow(
				trx,
				'requested_control_actions',
				command.payload.requestedControlActionId,
				command.payload.organizationId,
				{
					...('controlType' in changes ? { control_type: changes.controlType } : {}),
					...('recommendedMethodId' in changes
						? { recommended_method_id: changes.recommendedMethodId ?? null }
						: {}),
					...('summary' in changes ? { summary: changes.summary ?? null } : {}),
					...('requestedByProfileId' in changes
						? { requested_by_profile_id: changes.requestedByProfileId ?? null }
						: {}),
					...('requestedAt' in changes && changes.requestedAt !== undefined
						? { requested_at: changes.requestedAt === null ? sql`now()` : changes.requestedAt }
						: {}),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				returnColumns.requested_control_actions,
			);
		}
		case 'controlOperations.updateRequestedControlActionLocationAndContext':
			return updateActionRow(
				trx,
				'requested_control_actions',
				command.payload.requestedControlActionId,
				command.payload.organizationId,
				{
					...(await locationContextColumns(
						trx,
						command.payload.organizationId,
						command.payload.changes,
						{ collection: true },
					)),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				returnColumns.requested_control_actions,
			);
		case 'controlOperations.resolveRequestedControlAction':
			return updateActionRow(
				trx,
				'requested_control_actions',
				command.payload.requestedControlActionId,
				command.payload.organizationId,
				{
					resolved_at:
						command.payload.resolvedAt === null ? sql`now()` : command.payload.resolvedAt,
					resolved_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				returnColumns.requested_control_actions,
			);
		case 'controlOperations.reopenRequestedControlAction':
			return updateActionRow(
				trx,
				'requested_control_actions',
				command.payload.requestedControlActionId,
				command.payload.organizationId,
				{
					resolved_at: null,
					resolved_by_profile_id: null,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				returnColumns.requested_control_actions,
			);
		case 'controlOperations.deleteRequestedControlAction':
			await applyRecordDeletion(trx, {
				recordType: 'requestedControlAction',
				recordId: command.payload.requestedControlActionId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				acknowledged: {
					acknowledgedActionDetach: command.payload.acknowledgedActionDetach,
					acknowledgedMissionDetach: command.payload.acknowledgedMissionDetach,
				},
			});
			return softDelete(
				trx,
				'requested_control_actions',
				command.payload.requestedControlActionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				returnColumns.requested_control_actions,
			);
		default:
			throw new Error(`Unsupported requested control action command: ${command.type}`);
	}
}
