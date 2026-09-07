import { checkedValues } from '@simmer-mosquito/db';
import { type FieldWorkCommand, toDbEntityType } from '@simmer-mosquito/domain';
import {
	type AdditionalPersonnelRow,
	additionalPersonnelReturnColumns,
	type FieldWorkTransaction,
	softDelete,
} from './shared.js';

// ===========================================================================
// Additional personnel
// ===========================================================================

export async function writeAdditionalPersonnelCommand(
	trx: FieldWorkTransaction,
	command: FieldWorkCommand,
): Promise<AdditionalPersonnelRow | null> {
	switch (command.type) {
		case 'fieldWork.addAdditionalPersonnel': {
			const row = await trx
				.insertInto('additional_personnel')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
						id: command.payload.additionalPersonnelId,
						organization_id: command.payload.organizationId,
						personnel_profile_id: command.payload.personnelProfileId,
						entity_type: toDbEntityType(command.payload.target.type),
						entity_id: command.payload.target.id,
						created_by_profile_id: command.payload.actorProfileId,
						updated_by_profile_id: command.payload.actorProfileId,
					}),
				)
				.returning(additionalPersonnelReturnColumns)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'fieldWork.removeAdditionalPersonnel':
			return softDelete(
				trx,
				'additional_personnel',
				command.payload.additionalPersonnelId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				additionalPersonnelReturnColumns,
			);
		default:
			throw new Error(`Unsupported additional personnel command: ${command.type}`);
	}
}
