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
): TableCommands<'collection_species', AdultSurveillanceCommand, CollectionSpeciesRow> {
	return {
		table: 'collection_species',
		run: {
			db,
			write: writeCollectionSpeciesCommand,
			notFound: 'collection_species_not_found',
			key: 'collectionSpecies',
		},
		intents: {
			'adultSurveillance.addCollectionSpeciesCount': ({ payload, organization, id }) =>
				addCollectionSpeciesCountCommand({
					...organization,
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
			'adultSurveillance.updateCollectionSpeciesCount': ({ payload, organization, id }) =>
				updateCollectionSpeciesCountCommand({
					...organization,
					collectionSpeciesId: id,
					...(payload.count !== undefined
						? { count: readNumber(payload.count) ?? Number.NaN }
						: {}),
					...(payload.species_id !== undefined
						? { speciesId: readText(payload.species_id) ?? '' }
						: {}),
					...(payload.sex !== undefined ? { sex: readSpeciesSex(payload.sex) } : {}),
					...(payload.status !== undefined ? { status: readSpeciesStatus(payload.status) } : {}),
					...(payload.identified_by_profile_id !== undefined
						? { identifiedByProfileId: readNullableText(payload.identified_by_profile_id) }
						: {}),
					...(payload.identified_date !== undefined
						? { identifiedDate: readText(payload.identified_date) ?? '' }
						: {}),
				}),

			// No acknowledgement: nothing hangs off a species count, so removing one
			// takes nothing with it.
			'adultSurveillance.deleteCollectionSpeciesCount': ({ organization, id }) =>
				deleteCollectionSpeciesCountCommand({ ...organization, collectionSpeciesId: id }),
		},
	};
}
