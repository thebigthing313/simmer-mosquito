import type { ControlOperationsCommand } from '@simmer-mosquito/domain';
import {
	type ApplicationBatchRow,
	applicationBatchReturnColumns,
	type ControlOperationsTransaction,
	insertApplicationBatch,
	softDelete,
} from './shared.js';

// ===========================================================================
// Chemical application batches
// ===========================================================================

export async function writeApplicationBatchCommand(
	trx: ControlOperationsTransaction,
	command: ControlOperationsCommand,
): Promise<ApplicationBatchRow | null> {
	if (command.type === 'controlOperations.addChemicalApplicationBatch') {
		return insertApplicationBatch(trx, {
			id: command.payload.applicationBatchId,
			organizationId: command.payload.organizationId,
			applicationId: command.payload.applicationId,
			insecticideBatchId: command.payload.insecticideBatchId,
			actorProfileId: command.payload.actorProfileId,
		});
	}
	if (command.type === 'controlOperations.removeChemicalApplicationBatch') {
		return softDelete(
			trx,
			'application_batches',
			command.payload.applicationBatchId,
			command.payload.organizationId,
			command.payload.actorProfileId,
			applicationBatchReturnColumns,
		);
	}
	throw new Error(`Unsupported application batch command: ${command.type}`);
}
