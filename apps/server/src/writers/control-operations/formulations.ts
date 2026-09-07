import { assertRecordDeletable, sql } from '@simmer-mosquito/db';
import type { ControlOperationsCommand } from '@simmer-mosquito/domain';
import {
	type ControlOperationsTransaction,
	type FormulationRow,
	type FormulationUpdateColumns,
	formulationReturnColumns,
	softDelete,
} from './shared.js';

// ===========================================================================
// Formulations
// ===========================================================================

export async function writeFormulationCommand(
	trx: ControlOperationsTransaction,
	command: ControlOperationsCommand,
): Promise<FormulationRow | null> {
	switch (command.type) {
		case 'controlOperations.createFormulation': {
			const row = await trx
				.insertInto('formulations')
				.values({
					id: command.payload.formulationId,
					organization_id: command.payload.organizationId,
					formulation_name: command.payload.formulationName,
					description: command.payload.description,
					batch_size: command.payload.batchSize,
					batch_unit_id: command.payload.batchUnitId,
					is_active: true,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(formulationReturnColumns)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'controlOperations.updateFormulationDetails':
			return updateFormulation(trx, command.payload.formulationId, command.payload.organizationId, {
				...('formulationName' in command.payload.changes
					? { formulation_name: command.payload.changes.formulationName }
					: {}),
				...('description' in command.payload.changes
					? { description: command.payload.changes.description ?? null }
					: {}),
				...('batchSize' in command.payload.changes
					? { batch_size: command.payload.changes.batchSize }
					: {}),
				...('batchUnitId' in command.payload.changes
					? { batch_unit_id: command.payload.changes.batchUnitId }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'controlOperations.activateFormulation':
			return updateFormulation(trx, command.payload.formulationId, command.payload.organizationId, {
				is_active: true,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'controlOperations.deactivateFormulation':
			return updateFormulation(trx, command.payload.formulationId, command.payload.organizationId, {
				is_active: false,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'controlOperations.deleteFormulation':
			await assertRecordDeletable(trx, {
				recordType: 'formulation',
				recordId: command.payload.formulationId,
				organizationId: command.payload.organizationId,
			});
			return softDelete(
				trx,
				'formulations',
				command.payload.formulationId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				formulationReturnColumns,
			);
		default:
			throw new Error(`Unsupported formulation command: ${command.type}`);
	}
}

async function updateFormulation(
	trx: ControlOperationsTransaction,
	formulationId: string,
	organizationId: string,
	set: FormulationUpdateColumns,
): Promise<FormulationRow | null> {
	const row = await trx
		.updateTable('formulations')
		.set({ ...set, updated_at: sql`now()` })
		.where('id', '=', formulationId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(formulationReturnColumns)
		.executeTakeFirst();
	return row ?? null;
}
