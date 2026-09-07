import { applyRecordDeletion, checkedValues, sql, updateRow } from '@simmer-mosquito/db';
import type { LarvalSurveillanceCommand } from '@simmer-mosquito/domain';
import { returnColumns } from '../../return-columns.js';
import type { LarvalSurveillanceTransaction, SampleRow, SampleUpdateColumns } from './shared.js';

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

/** Exported for `table-commands/samples.ts` — see `writeHabitatCommand`. */
export async function writeSampleCommand(
	trx: LarvalSurveillanceTransaction,
	command: LarvalSurveillanceCommand,
): Promise<SampleRow | null> {
	switch (command.type) {
		case 'larvalSurveillance.addInspectionSample':
			return insertSample(trx, {
				id: command.payload.sampleId,
				organizationId: command.payload.organizationId,
				inspectionId: command.payload.inspectionId,
				displayName: command.payload.displayName,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.addUnlabeledInspectionSample':
			return insertSample(trx, {
				id: command.payload.sampleId,
				organizationId: command.payload.organizationId,
				inspectionId: command.payload.inspectionId,
				displayName: null,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.updateInspectionSample':
			return updateSample(trx, command.payload.sampleId, command.payload.organizationId, {
				...(command.payload.changes.displayName !== undefined
					? { display_name: command.payload.changes.displayName }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.markSampleZeroLarvae':
			return updateSample(trx, command.payload.sampleId, command.payload.organizationId, {
				is_zero_larvae: true,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.clearSampleZeroLarvae':
			return updateSample(trx, command.payload.sampleId, command.payload.organizationId, {
				is_zero_larvae: false,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.setSampleNonMosquitoPresence':
			return updateSample(trx, command.payload.sampleId, command.payload.organizationId, {
				has_non_mosquito: command.payload.hasNonMosquito,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.setSampleUnidentifiableReason':
			return updateSample(trx, command.payload.sampleId, command.payload.organizationId, {
				unidentifiable_reason: command.payload.unidentifiableReason,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.deleteInspectionSample': {
			await applyRecordDeletion(trx, {
				recordType: 'sample',
				recordId: command.payload.sampleId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				acknowledged: {
					acknowledgedAssociatedRecordsDeletion:
						command.payload.acknowledgedAssociatedRecordsDeletion,
				},
			});
			const row = await trx
				.updateTable('samples')
				.set({
					deleted_at: sql`now()`,
					deleted_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
					updated_at: sql`now()`,
				})
				.where('id', '=', command.payload.sampleId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.returning(returnColumns.samples)
				.executeTakeFirst();
			return row ?? null;
		}
		default:
			throw new Error(`Unsupported sample command: ${command.type}`);
	}
}

async function insertSample(
	trx: LarvalSurveillanceTransaction,
	input: {
		readonly id: string;
		readonly organizationId: string;
		readonly inspectionId: string;
		readonly displayName: string | null;
		readonly actorProfileId: string;
	},
): Promise<SampleRow> {
	const row = await trx
		.insertInto('samples')
		.values(
			await checkedValues(trx, input.organizationId, {
				id: input.id,
				organization_id: input.organizationId,
				inspection_id: input.inspectionId,
				display_name: input.displayName,
				is_zero_larvae: false,
				has_non_mosquito: false,
				created_by_profile_id: input.actorProfileId,
				updated_by_profile_id: input.actorProfileId,
			}),
		)
		.returning(returnColumns.samples)
		.executeTakeFirstOrThrow();
	return row;
}

async function updateSample(
	trx: LarvalSurveillanceTransaction,
	sampleId: string,
	organizationId: string,
	set: SampleUpdateColumns,
): Promise<SampleRow | null> {
	return updateRow(trx, 'samples', sampleId, organizationId, set, returnColumns.samples);
}
