/**
 * The `samples` table, as commands.
 *
 * The clearest case in the domain for naming the command rather than inferring
 * it. The old routes worked out three separate decisions from the payload:
 *
 * - a `displayName` that read as text meant `addInspectionSample`, and one that
 *   did not meant `addUnlabeledInspectionSample` — so a caller who sent a name
 *   of spaces silently created an unlabeled sample;
 * - `isZeroLarvae: true` meant `markSampleZeroLarvae` and `false` meant
 *   `clearSampleZeroLarvae`, a value read for its direction;
 * - and the rest of the PATCH was four `'field' in payload` checks.
 *
 * Eight named entries below, each reading only what its own command takes.
 *
 * ## Field names
 *
 * Postgres column names throughout — `inspection_id`, `display_name`,
 * `has_non_mosquito`, `unidentifiable_reason`. Samples carry no geometry and no
 * lifecycle instruction, so there is no camelCase exception here at all.
 */

import {
	addInspectionSampleCommand,
	addUnlabeledInspectionSampleCommand,
	clearSampleZeroLarvaeCommand,
	deleteInspectionSampleCommand,
	type LarvalSurveillanceCommand,
	markSampleZeroLarvaeCommand,
	setSampleNonMosquitoPresenceCommand,
	setSampleUnidentifiableReasonCommand,
	updateInspectionSampleCommand,
} from '@simmer-mosquito/domain';
import { readNullableText, readText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import { writeSampleCommand } from '../larval-surveillance-commands/samples.js';
import type { SampleRow } from '../larval-surveillance-commands/shared.js';
import type { TableCommands } from './dispatch.js';
import { acknowledged } from './shared.js';

export function sampleTableCommands(
	db: CommandDb,
): TableCommands<LarvalSurveillanceCommand, SampleRow> {
	return {
		table: 'samples',
		run: { db, write: writeSampleCommand, notFound: 'sample_not_found', key: 'sample' },
		intents: {
			// A labelled sample and an unlabeled one are two commands because they are
			// two intentions, not because one has a field the other lacks. The domain
			// refuses a blank name to the first, which is the right answer to a caller
			// who meant the second and did not say so.
			'larvalSurveillance.addInspectionSample': ({ payload, agency, id }) =>
				addInspectionSampleCommand({
					...agency,
					sampleId: id,
					inspectionId: readText(payload.inspection_id) ?? '',
					displayName: readText(payload.display_name) ?? '',
				}),

			'larvalSurveillance.addUnlabeledInspectionSample': ({ payload, agency, id }) =>
				addUnlabeledInspectionSampleCommand({
					...agency,
					sampleId: id,
					inspectionId: readText(payload.inspection_id) ?? '',
				}),

			'larvalSurveillance.updateInspectionSample': ({ payload, agency, id }) =>
				updateInspectionSampleCommand({
					...agency,
					sampleId: id,
					displayName: readText(payload.display_name) ?? '',
				}),

			// `is_zero_larvae` is a column a client can watch change, but which way it
			// moved is the command's to say. Two names rather than one boolean read for
			// its direction — the same treatment `markHabitatInaccessible` gets.
			'larvalSurveillance.markSampleZeroLarvae': ({ agency, id }) =>
				markSampleZeroLarvaeCommand({ ...agency, sampleId: id }),

			'larvalSurveillance.clearSampleZeroLarvae': ({ agency, id }) =>
				clearSampleZeroLarvaeCommand({ ...agency, sampleId: id }),

			// Not the same shape as the pair above, and deliberately: non-mosquito
			// presence is an observation the field recorded, so the value is the point.
			'larvalSurveillance.setSampleNonMosquitoPresence': ({ payload, agency, id }) =>
				setSampleNonMosquitoPresenceCommand({
					...agency,
					sampleId: id,
					hasNonMosquito: payload.has_non_mosquito === true,
				}),

			'larvalSurveillance.setSampleUnidentifiableReason': ({ payload, agency, id }) =>
				setSampleUnidentifiableReasonCommand({
					...agency,
					sampleId: id,
					unidentifiableReason: readNullableText(payload.unidentifiable_reason),
				}),

			'larvalSurveillance.deleteInspectionSample': ({ payload, agency, id }) =>
				deleteInspectionSampleCommand({
					...agency,
					sampleId: id,
					acknowledgedAssociatedRecordsDeletion: acknowledged(
						payload.acknowledgedAssociatedRecordsDeletion,
					),
				}),
		},
	};
}
