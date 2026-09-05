/**
 * The `inspections` table, as commands.
 *
 * Six commands, three of which the old POST route chose between by reading the
 * payload: an `assignmentItemId` meant the stop-execution command, a `habitatId`
 * meant the habitat inspection, and neither meant the ad hoc one. Those are three
 * genuinely different records — one closes an assignment stop, one attaches to a
 * habitat, one carries its own geometry — and which the user meant was being
 * inferred from which id happened to be in the body. Here the request says.
 *
 * ## Field names
 *
 * Postgres column names: `habitat_id`, `inspection_date`, `is_wet`,
 * `dip_count`, `has_first_instar`. The three exceptions stay camelCase because
 * they name no column: `locationSource` is a domain instruction (geometry never
 * syncs), `completedAt` is when the stop closed rather than anything stored on
 * the inspection, and the execution flags are acknowledgements.
 *
 * ## The entry policy no longer costs a query
 *
 * Whether an organization records larvae as a density band or a count is an
 * organization setting, and the domain validates the result against it. The old
 * routes fetched it with `loadInspectionPolicy` on every POST and PATCH — but
 * the settings blob is already on `AuthContext`, put there for the timezone and
 * resolved from the same per-request identity query. So this reads it off the
 * context instead: same value, same freshness, one fewer round trip.
 */

import {
	deleteInspectionCommand,
	type ResolvedLarvalInspectionEntryPolicy,
	recordAdHocInspectionCommand,
	recordHabitatInspectionCommand,
	recordHabitatInspectionForAssignmentItemCommand,
	resolveOrganizationSettings,
	updateAdHocInspectionLocationCommand,
	updateInspectionFieldDetailsCommand,
} from '@simmer-mosquito/domain';
import type { AuthContext } from '../auth-context.js';
import {
	type CommandPayload,
	readExecutionOptions,
	readNullableText,
	readText,
} from '../command-payload.js';
import { type CommandDb, readDate, readNumberOrNull } from '../command-write.js';
import {
	type InspectionCommand,
	writeInspectionCommand,
} from '../larval-surveillance-commands/inspections.js';
import { type InspectionRow, readDensity } from '../larval-surveillance-commands/shared.js';
import type { TableCommands } from './dispatch.js';
import { acknowledged } from './shared.js';

/**
 * The keys an inspection write reads that are not its columns: where it
 * happened, and when the assignment stop it closes was finished.
 */
type InspectionArgument = 'locationSource' | 'completedAt';

/** The body of a write to this module's table. */
type InspectionPayload = CommandPayload<'inspections', InspectionArgument>;

/**
 * The result columns, as the domain names them.
 *
 * Every one of the four recording commands takes the whole set — an inspection
 * is its result — so this is read once and spread rather than restated per
 * entry. The booleans read `=== true` rather than being coerced: a missing flag
 * is false, and a client that sends `"true"` is sending something the column
 * cannot hold.
 */
function inspectionResult(payload: InspectionPayload) {
	return {
		inspectionDate: readText(payload.inspection_date) ?? '',
		inspectedByProfileId: readNullableText(payload.inspected_by_profile_id),
		isWet: payload.is_wet === true,
		dipCount: readNumberOrNull(payload.dip_count),
		density: readDensity(payload.density),
		larvaeCount: readNumberOrNull(payload.larvae_count),
		hasFirstInstar: payload.has_first_instar === true,
		hasSecondInstar: payload.has_second_instar === true,
		hasThirdInstar: payload.has_third_instar === true,
		hasFourthInstar: payload.has_fourth_instar === true,
		hasPupae: payload.has_pupae === true,
		hasEggs: payload.has_eggs === true,
	};
}

function inspectionPolicy(authContext: AuthContext): ResolvedLarvalInspectionEntryPolicy {
	return resolveOrganizationSettings(authContext.organization.settings).settings.larvalSurveillance
		.inspectionEntryPolicy;
}

export function inspectionTableCommands(
	db: CommandDb,
): TableCommands<'inspections', InspectionCommand, InspectionRow, InspectionArgument> {
	return {
		table: 'inspections',
		run: { db, write: writeInspectionCommand, notFound: 'inspection_not_found', key: 'inspection' },
		intents: {
			'larvalSurveillance.recordHabitatInspection': ({ payload, organization, authContext, id }) =>
				recordHabitatInspectionCommand({
					...organization,
					inspectionId: id,
					habitatId: readText(payload.habitat_id) ?? '',
					policy: inspectionPolicy(authContext),
					...inspectionResult(payload),
				}),

			// A `fieldWork.*` command written to this table, because the endpoint follows
			// the table and the command vocabulary follows the unit of work — a stop,
			// closed by the record that was the reason for it. Recorded and closed in one
			// transaction, so the work can never exist with the stop still pending.
			'fieldWork.recordHabitatInspectionForAssignmentItem': ({
				payload,
				organization,
				authContext,
				id,
			}) =>
				recordHabitatInspectionForAssignmentItemCommand({
					...organization,
					inspectionId: id,
					assignmentItemId: readText(payload.assignment_item_id) ?? '',
					// Nullable: the stop already names a habitat, so the ordinary call sends
					// none and cannot disagree with it.
					habitatId: readNullableText(payload.habitat_id),
					policy: inspectionPolicy(authContext),
					completedAt: readDate(payload.completedAt),
					...readExecutionOptions(payload),
					...inspectionResult(payload),
				}),

			'larvalSurveillance.recordAdHocInspection': ({ payload, organization, authContext, id }) =>
				recordAdHocInspectionCommand({
					...organization,
					inspectionId: id,
					// Untyped by design: which location kinds an ad hoc inspection accepts is
					// the domain builder's rule, and re-stating it here would be a second copy
					// that could disagree.
					locationSource: payload.locationSource as never,
					addressId: readNullableText(payload.address_id),
					habitatTypeId: readNullableText(payload.habitat_type_id),
					policy: inspectionPolicy(authContext),
					...inspectionResult(payload),
				}),

			'larvalSurveillance.updateInspectionFieldDetails': ({
				payload,
				organization,
				authContext,
				id,
			}) =>
				updateInspectionFieldDetailsCommand({
					...organization,
					inspectionId: id,
					policy: inspectionPolicy(authContext),
					...inspectionResult(payload),
				}),

			// The only entry that still reads presence, and for a reason presence can
			// actually answer: each of the three is independently optional, and a
			// `null` address means "detach" where an absent one means "leave it".
			'larvalSurveillance.updateAdHocInspectionLocation': ({ payload, organization, id }) =>
				updateAdHocInspectionLocationCommand({
					...organization,
					inspectionId: id,
					...(payload.locationSource !== undefined
						? { locationSource: payload.locationSource as never }
						: {}),
					...(payload.address_id !== undefined
						? { addressId: readNullableText(payload.address_id) }
						: {}),
					...(payload.habitat_type_id !== undefined
						? { habitatTypeId: readNullableText(payload.habitat_type_id) }
						: {}),
				}),

			'larvalSurveillance.deleteInspection': ({ payload, organization, id }) =>
				deleteInspectionCommand({
					...organization,
					inspectionId: id,
					acknowledgedAssociatedRecordsDeletion: acknowledged(
						payload,
						'acknowledgedAssociatedRecordsDeletion',
					),
					acknowledgedCrossDomainDetach: acknowledged(payload, 'acknowledgedCrossDomainDetach'),
				}),
		},
	};
}
