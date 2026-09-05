/**
 * The `organization_species` table, as commands.
 *
 * Which of the global species an agency identifies against. The rows carry no
 * fields of their own beyond the two ids, so this is the smallest map on the
 * surface — and the one where naming the command earns the most, because both
 * commands write the same two columns and differ only in direction.
 *
 * `unselectOrganizationSpecies` is a soft delete, not a hard one, and
 * `enableOrganizationSpecies` in `packages/db` upserts a previously unselected
 * row back to life on the unique `(organization_id, species_id)` pair. So the
 * row a select produces may be one that already existed — which is exactly why
 * the client sends the id it wants and the command says which way it is going,
 * rather than the server reading `deleted_at` to work it out.
 *
 * ## Field names
 *
 * Postgres column names: `species_id`. `organization_id` is not read from the
 * payload on any table here — it comes off the session.
 */

import {
	type FoundationCommand,
	selectOrganizationSpeciesCommand,
	unselectOrganizationSpeciesCommand,
} from '@simmer-mosquito/domain';
import { readText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import { writeOrganizationSpeciesCommand } from '../foundation-geography-commands/organization-species.js';
import type { OrganizationSpeciesRow } from '../foundation-geography-commands/shared.js';
import type { TableCommands } from './dispatch.js';

export function organizationSpeciesTableCommands(
	db: CommandDb,
): TableCommands<'organization_species', FoundationCommand, OrganizationSpeciesRow> {
	return {
		table: 'organization_species',
		run: {
			db,
			write: writeOrganizationSpeciesCommand,
			notFound: 'organization_species_not_found',
			key: 'organizationSpecies',
		},
		intents: {
			'foundation.selectOrganizationSpecies': ({ payload, organization, id }) =>
				selectOrganizationSpeciesCommand({
					...organization,
					organizationSpeciesId: id,
					speciesId: readText(payload.species_id) ?? '',
				}),

			'foundation.unselectOrganizationSpecies': ({ organization, id }) =>
				unselectOrganizationSpeciesCommand({ ...organization, organizationSpeciesId: id }),
		},
	};
}
