import { checkedValues, sql, updateRow } from '@simmer-mosquito/db';
import type { AdultSurveillanceCommand } from '@simmer-mosquito/domain';
import { returnColumns } from '../../return-columns.js';
import {
	type AdultSurveillanceTransaction,
	type CollectionSpeciesRow,
	localDateColumn,
} from './shared.js';

// ---------------------------------------------------------------------------
// Collection species counts
// ---------------------------------------------------------------------------

/** Exported for `table-commands/collection-species.ts` — see `writeHabitatCommand`. */
export async function writeCollectionSpeciesCommand(
	trx: AdultSurveillanceTransaction,
	command: AdultSurveillanceCommand,
): Promise<CollectionSpeciesRow | null> {
	switch (command.type) {
		case 'adultSurveillance.addCollectionSpeciesCount': {
			const row = await trx
				.insertInto('collection_species')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
						id: command.payload.collectionSpeciesId,
						organization_id: command.payload.organizationId,
						collection_id: command.payload.collectionId,
						species_id: command.payload.speciesId,
						count: command.payload.count,
						sex: command.payload.sex,
						status: command.payload.status,
						identified_by_profile_id: command.payload.identifiedByProfileId,
						identified_date: localDateColumn(command.payload.identifiedDate),
						created_by_profile_id: command.payload.actorProfileId,
						updated_by_profile_id: command.payload.actorProfileId,
					}),
				)
				.returning(returnColumns.collection_species)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'adultSurveillance.updateCollectionSpeciesCount': {
			const changes = command.payload.changes;
			return updateRow(
				trx,
				'collection_species',
				command.payload.collectionSpeciesId,
				command.payload.organizationId,
				{
					...('count' in changes ? { count: changes.count } : {}),
					...('speciesId' in changes ? { species_id: changes.speciesId } : {}),
					...('sex' in changes ? { sex: changes.sex ?? null } : {}),
					...('status' in changes ? { status: changes.status ?? null } : {}),
					...('identifiedByProfileId' in changes
						? { identified_by_profile_id: changes.identifiedByProfileId ?? null }
						: {}),
					...('identifiedDate' in changes && changes.identifiedDate !== undefined
						? { identified_date: localDateColumn(changes.identifiedDate) }
						: {}),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				returnColumns.collection_species,
			);
		}
		case 'adultSurveillance.deleteCollectionSpeciesCount': {
			const row = await trx
				.updateTable('collection_species')
				.set({
					deleted_at: sql`now()`,
					deleted_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
					updated_at: sql`now()`,
				})
				.where('id', '=', command.payload.collectionSpeciesId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.returning(returnColumns.collection_species)
				.executeTakeFirst();
			return row ?? null;
		}
		default:
			throw new Error(`Unsupported collection species command: ${command.type}`);
	}
}
