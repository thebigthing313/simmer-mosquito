/**
 * The `sample_species` table, as commands.
 *
 * Three commands and the smallest map in the domain — a species count is a
 * species, a number, and who keyed it out when.
 *
 * ## Field names
 *
 * Postgres column names: `sample_id`, `species_id`, `larvae_count`,
 * `identified_by_profile_id`, `identified_at`. `identified_at` is a `date`
 * column despite the name, so it travels as `YYYY-MM-DD` and is read as text —
 * see `tables/sample_species.ts` for why a client never parses one.
 *
 * `Number.NaN` is what a missing or unreadable count becomes, rather than a zero
 * or a refusal here. The domain requires a positive integer and names the field
 * when it is not one; standing in a plausible number instead would record a
 * count nobody entered.
 */

import {
	addSampleSpeciesCountCommand,
	deleteSampleSpeciesCountCommand,
	type LarvalSurveillanceCommand,
	updateSampleSpeciesCountCommand,
} from '@simmer-mosquito/domain';
import { readNullableText, readNumber, readText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import { writeSampleSpeciesCommand } from '../larval-surveillance-commands/sample-species-counts.js';
import type { SampleSpeciesRow } from '../larval-surveillance-commands/shared.js';
import type { TableCommands } from './dispatch.js';

export function sampleSpeciesTableCommands(
	db: CommandDb,
): TableCommands<'sample_species', LarvalSurveillanceCommand, SampleSpeciesRow> {
	return {
		table: 'sample_species',
		run: {
			db,
			write: writeSampleSpeciesCommand,
			notFound: 'sample_species_not_found',
			key: 'sampleSpecies',
		},
		intents: {
			'larvalSurveillance.addSampleSpeciesCount': ({ payload, agency, id }) =>
				addSampleSpeciesCountCommand({
					...agency,
					sampleSpeciesId: id,
					sampleId: readText(payload.sample_id) ?? '',
					speciesId: readText(payload.species_id) ?? '',
					larvaeCount: readNumber(payload.larvae_count) ?? Number.NaN,
					identifiedByProfileId: readNullableText(payload.identified_by_profile_id),
					identifiedAt: readText(payload.identified_at) ?? '',
				}),

			// Four independently optional fields, so presence is genuinely the question
			// here — a count corrected from 12 to 8 says nothing about the species, and
			// re-sending the species would be this layer inventing an edit.
			'larvalSurveillance.updateSampleSpeciesCount': ({ payload, agency, id }) =>
				updateSampleSpeciesCountCommand({
					...agency,
					sampleSpeciesId: id,
					...(payload.species_id !== undefined
						? { speciesId: readText(payload.species_id) ?? '' }
						: {}),
					...(payload.larvae_count !== undefined
						? { larvaeCount: readNumber(payload.larvae_count) ?? Number.NaN }
						: {}),
					...(payload.identified_by_profile_id !== undefined
						? { identifiedByProfileId: readNullableText(payload.identified_by_profile_id) }
						: {}),
					...(payload.identified_at !== undefined
						? { identifiedAt: readText(payload.identified_at) ?? '' }
						: {}),
				}),

			// No acknowledgement: nothing hangs off a species count, so removing one
			// takes nothing with it.
			'larvalSurveillance.deleteSampleSpeciesCount': ({ agency, id }) =>
				deleteSampleSpeciesCountCommand({ ...agency, sampleSpeciesId: id }),
		},
	};
}
