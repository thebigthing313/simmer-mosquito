/**
 * The `habitats` table, as commands.
 *
 * The eleven commands the habitat writer handles, each reachable by name
 * through `/commands/habitats`. Nothing about how a habitat is written changes:
 * `writeHabitatCommand` and its response shape are imported from the existing
 * module. What changes is the choosing.
 *
 * Compare `buildHabitatUpdateCommands` in
 * `larval-surveillance-commands/habitats.ts`, which is eighty lines of
 * `'habitatName' in payload`, `'locationSource' in payload`, and
 * `typeof payload.isInaccessible === 'boolean'` reconstructing what the user
 * meant from which keys arrived. None of that is here, because the request says.
 *
 * ## Field names
 *
 * The payload is the row as the client holds it, so keys are Postgres column
 * names: `habitat_name`, `habitat_type_id`, `is_active`. The domain speaks its
 * own vocabulary, so each builder below is a translation, and that translation is
 * the only per-table work this design needs.
 *
 * `locationSource` is the exception, and stays camelCase: it is a domain
 * instruction rather than a column — geometry never syncs, so there is no column
 * for it to have been named after.
 */

import {
	clearHabitatInaccessibleCommand,
	createHabitatCommand,
	createHabitatFromInspectionCommand,
	deleteHabitatCommand,
	type LarvalSurveillanceCommand,
	markHabitatInaccessibleCommand,
	mergeHabitatsCommand,
	reactivateHabitatCommand,
	retireHabitatCommand,
	updateHabitatConfigurationCommand,
	updateHabitatDetailsCommand,
	updateHabitatLocationCommand,
} from '@simmer-mosquito/domain';
import { readNullableText, readText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import { writeHabitatCommand } from '../larval-surveillance-commands/habitats.js';
import type { SafeHabitat } from '../larval-surveillance-commands/shared.js';
import type { TableCommands } from './dispatch.js';
import { acknowledged, readIdList } from './shared.js';

export function habitatTableCommands(
	db: CommandDb,
): TableCommands<LarvalSurveillanceCommand, SafeHabitat> {
	return {
		table: 'habitats',
		run: { db, write: writeHabitatCommand, notFound: 'habitat_not_found', key: 'habitat' },
		intents: {
			'larvalSurveillance.createHabitat': ({ payload, agency, id }) =>
				createHabitatCommand({
					...agency,
					habitatId: id,
					// Passed through untyped: which location kinds a habitat accepts is the
					// domain builder's rule, and re-stating it here would be a second copy
					// of it that could disagree.
					locationSource: payload.locationSource as never,
					addressId: readNullableText(payload.address_id),
					habitatTypeId: readNullableText(payload.habitat_type_id),
					habitatName: readNullableText(payload.habitat_name),
					description: readText(payload.description) ?? '',
					metadata: payload.metadata ?? null,
				}),

			'larvalSurveillance.createHabitatFromInspection': ({ payload, agency, id }) =>
				createHabitatFromInspectionCommand({
					...agency,
					habitatId: id,
					inspectionId: readText(payload.inspection_id) ?? '',
					habitatName: readNullableText(payload.habitat_name),
					description: readText(payload.description) ?? '',
					metadata: payload.metadata ?? null,
				}),

			// The three updates read only what they take. A save that changed the name
			// and redrew the shape names both `updateHabitatDetails` and
			// `updateHabitatLocation`, and each reads its own half of one payload.
			'larvalSurveillance.updateHabitatDetails': ({ payload, agency, id }) =>
				updateHabitatDetailsCommand({
					...agency,
					habitatId: id,
					...('habitat_name' in payload
						? { habitatName: readNullableText(payload.habitat_name) }
						: {}),
					...('description' in payload ? { description: readText(payload.description) ?? '' } : {}),
					...('metadata' in payload ? { metadata: payload.metadata ?? null } : {}),
				}),

			'larvalSurveillance.updateHabitatLocation': ({ payload, agency, id }) =>
				updateHabitatLocationCommand({
					...agency,
					habitatId: id,
					locationSource: payload.locationSource as never,
					acknowledgedHabitatLocationSemanticsChange: acknowledged(
						payload.acknowledgedHabitatLocationSemanticsChange,
					),
				}),

			'larvalSurveillance.updateHabitatConfiguration': ({ payload, agency, id }) =>
				updateHabitatConfigurationCommand({
					...agency,
					habitatId: id,
					...('address_id' in payload ? { addressId: readNullableText(payload.address_id) } : {}),
					...('habitat_type_id' in payload
						? { habitatTypeId: readNullableText(payload.habitat_type_id) }
						: {}),
					acknowledgedHabitatConfigurationSemanticsChange: acknowledged(
						payload.acknowledgedHabitatConfigurationSemanticsChange,
					),
				}),

			// `is_inaccessible` and `is_active` are columns a client can see change, but
			// which way they moved is the command's to say, not the value's. Four names
			// rather than two booleans read for their direction.
			'larvalSurveillance.markHabitatInaccessible': ({ agency, id }) =>
				markHabitatInaccessibleCommand({ ...agency, habitatId: id }),

			'larvalSurveillance.clearHabitatInaccessible': ({ agency, id }) =>
				clearHabitatInaccessibleCommand({ ...agency, habitatId: id }),

			'larvalSurveillance.retireHabitat': ({ payload, agency, id }) =>
				retireHabitatCommand({
					...agency,
					habitatId: id,
					acknowledgedRouteRemoval: acknowledged(payload.acknowledgedRouteRemoval),
				}),

			'larvalSurveillance.reactivateHabitat': ({ agency, id }) =>
				reactivateHabitatCommand({ ...agency, habitatId: id }),

			// The row this write names is the *target* — the habitat that survives —
			// and the sources come from the body. Same shape as `mergeAddresses` and
			// `mergeContacts`.
			'larvalSurveillance.mergeHabitats': ({ payload, agency, id }) =>
				mergeHabitatsCommand({
					...agency,
					targetHabitatId: id,
					sourceHabitatIds: readIdList(payload.sourceHabitatIds),
					acknowledgedMergeConsolidatesHistory: acknowledged(
						payload.acknowledgedMergeConsolidatesHistory,
					),
				}),

			'larvalSurveillance.deleteHabitat': ({ payload, agency, id }) =>
				deleteHabitatCommand({
					...agency,
					habitatId: id,
					acknowledgedHabitatDelete: acknowledged(payload.acknowledgedHabitatDelete),
					acknowledgedInspectionDetach: acknowledged(payload.acknowledgedInspectionDetach),
					acknowledgedCrossDomainDetach: acknowledged(payload.acknowledgedCrossDomainDetach),
				}),
		},
	};
}
