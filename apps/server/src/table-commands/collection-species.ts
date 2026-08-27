/**
 * The `collection_species` table, as commands.
 *
 * The adult twin of `sample-species.ts`: three commands, add, correct, remove.
 * What a larval sample counts as a number of larvae, an adult collection counts
 * as a number of mosquitoes with a sex and a physiological status, so those two
 * enums are the only shape difference between the maps.
 *
 * ## Field names
 *
 * Postgres column names: `collection_id`, `species_id`, `count`, `sex`,
 * `status`, `identified_by_profile_id`, `identified_date`. `identified_date` is
 * a `date` column, so it travels as `YYYY-MM-DD` and is read as text.
 *
 * `sex` and `status` are narrowed to the values the enum columns hold, and
 * anything else becomes `null` rather than a refusal — the same reading the old
 * route did. Both are genuinely optional: a count keyed to species without
 * sexing it is a complete record.
 */

import {
	type AdultSurveillanceCommand,
	addCollectionSpeciesCountCommand,
	deleteCollectionSpeciesCountCommand,
	updateCollectionSpeciesCountCommand,
} from '@simmer-mosquito/domain';
import { writeCollectionSpeciesCommand } from '../adult-surveillance-commands/collection-species-counts.js';
import {
	type CollectionSpeciesRow,
	readSpeciesSex,
	readSpeciesStatus,
} from '../adult-surveillance-commands/shared.js';
import { readNullableText, readNumber, readText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import type { TableCommands } from './dispatch.js';

export function collectionSpeciesTableCommands(
	db: CommandDb,
): TableCommands<AdultSurveillanceCommand, CollectionSpeciesRow> {
	return {
		table: 'collection_species',
		run: {
			db,
			write: writeCollectionSpeciesCommand,
			notFound: 'collection_species_not_found',
			key: 'collectionSpecies',
		},
		intents: {
			'adultSurveillance.addCollectionSpeciesCount': ({ payload, agency, id }) =>
				addCollectionSpeciesCountCommand({
					...agency,
					collectionSpeciesId: id,
					collectionId: readText(payload.collection_id) ?? '',
					speciesId: readText(payload.species_id) ?? '',
					// `Number.NaN` rather than a zero: the domain requires a positive
					// integer and names the field when it is not one, where standing in a
					// plausible number would record a count nobody entered.
					count: readNumber(payload.count) ?? Number.NaN,
					sex: readSpeciesSex(payload.sex),
					status: readSpeciesStatus(payload.status),
					identifiedByProfileId: readNullableText(payload.identified_by_profile_id),
					identifiedDate: readText(payload.identified_date) ?? '',
				}),

			// Six independently optional fields, so presence is genuinely the question
			// here — a count corrected from 40 to 38 says nothing about the species,
			// and re-sending the rest would be this layer inventing an edit.
			'adultSurveillance.updateCollectionSpeciesCount': ({ payload, agency, id }) =>
				updateCollectionSpeciesCountCommand({
					...agency,
					collectionSpeciesId: id,
					...('count' in payload ? { count: readNumber(payload.count) ?? Number.NaN } : {}),
					...('species_id' in payload ? { speciesId: readText(payload.species_id) ?? '' } : {}),
					...('sex' in payload ? { sex: readSpeciesSex(payload.sex) } : {}),
					...('status' in payload ? { status: readSpeciesStatus(payload.status) } : {}),
					...('identified_by_profile_id' in payload
						? { identifiedByProfileId: readNullableText(payload.identified_by_profile_id) }
						: {}),
					...('identified_date' in payload
						? { identifiedDate: readText(payload.identified_date) ?? '' }
						: {}),
				}),

			// No acknowledgement: nothing hangs off a species count, so removing one
			// takes nothing with it.
			'adultSurveillance.deleteCollectionSpeciesCount': ({ agency, id }) =>
				deleteCollectionSpeciesCountCommand({ ...agency, collectionSpeciesId: id }),
		},
	};
}
