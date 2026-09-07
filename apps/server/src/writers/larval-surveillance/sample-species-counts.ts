import { checkedValues, sql, updateRow } from '@simmer-mosquito/db';
import type { LarvalSurveillanceCommand } from '@simmer-mosquito/domain';
import {
	type LarvalSurveillanceTransaction,
	localDateColumn,
	type SampleSpeciesRow,
	sampleSpeciesReturnColumns,
} from './shared.js';

// ---------------------------------------------------------------------------
// Sample species counts
// ---------------------------------------------------------------------------

/** Exported for `table-commands/sample-species.ts` — see `writeHabitatCommand`. */
export async function writeSampleSpeciesCommand(
	trx: LarvalSurveillanceTransaction,
	command: LarvalSurveillanceCommand,
): Promise<SampleSpeciesRow | null> {
	switch (command.type) {
		case 'larvalSurveillance.addSampleSpeciesCount': {
			const row = await trx
				.insertInto('sample_species')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
						id: command.payload.sampleSpeciesId,
						organization_id: command.payload.organizationId,
						sample_id: command.payload.sampleId,
						species_id: command.payload.speciesId,
						larvae_count: command.payload.larvaeCount,
						identified_by_profile_id: command.payload.identifiedByProfileId,
						identified_at: localDateColumn(command.payload.identifiedAt),
						created_by_profile_id: command.payload.actorProfileId,
						updated_by_profile_id: command.payload.actorProfileId,
					}),
				)
				.returning(sampleSpeciesReturnColumns)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'larvalSurveillance.updateSampleSpeciesCount': {
			const changes = command.payload.changes;
			return updateRow(
				trx,
				'sample_species',
				command.payload.sampleSpeciesId,
				command.payload.organizationId,
				{
					...('speciesId' in changes ? { species_id: changes.speciesId } : {}),
					...('larvaeCount' in changes ? { larvae_count: changes.larvaeCount } : {}),
					...('identifiedByProfileId' in changes
						? { identified_by_profile_id: changes.identifiedByProfileId ?? null }
						: {}),
					...('identifiedAt' in changes && changes.identifiedAt !== undefined
						? { identified_at: localDateColumn(changes.identifiedAt) }
						: {}),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				sampleSpeciesReturnColumns,
			);
		}
		case 'larvalSurveillance.deleteSampleSpeciesCount': {
			const row = await trx
				.updateTable('sample_species')
				.set({
					deleted_at: sql`now()`,
					deleted_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
					updated_at: sql`now()`,
				})
				.where('id', '=', command.payload.sampleSpeciesId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.returning(sampleSpeciesReturnColumns)
				.executeTakeFirst();
			return row ?? null;
		}
		default:
			throw new Error(`Unsupported sample species command: ${command.type}`);
	}
}
