import type { FoundationCommand } from '@simmer-mosquito/domain';
import {
	type FoundationTransaction,
	type OrganizationSpeciesRow,
	organizationSpeciesReturnColumns,
	softDelete,
} from './shared.js';

// ===========================================================================
// Organization species selection
// ===========================================================================

/** Exported for `table-commands/organization-species.ts` — one writer, two doors. */
export async function writeOrganizationSpeciesCommand(
	trx: FoundationTransaction,
	command: FoundationCommand,
): Promise<OrganizationSpeciesRow | null> {
	switch (command.type) {
		case 'foundation.selectOrganizationSpecies': {
			const row = await trx
				.insertInto('organization_species')
				.values({
					id: command.payload.organizationSpeciesId,
					organization_id: command.payload.organizationId,
					species_id: command.payload.speciesId,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(organizationSpeciesReturnColumns)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'foundation.unselectOrganizationSpecies':
			return softDelete(
				trx,
				'organization_species',
				command.payload.organizationSpeciesId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				organizationSpeciesReturnColumns,
			);
		default:
			throw new Error(`Unsupported organization species command: ${command.type}`);
	}
}
