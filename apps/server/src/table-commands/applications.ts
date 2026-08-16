/**
 * The `applications` and `application_batches` tables, as commands.
 *
 * A chemical application is the fourth performed-action record, and everything
 * `performed-actions.ts` says applies here — the mission-stop create chosen by
 * name rather than by a `mission_item_id` in the body, `context` taken whole
 * rather than rebuilt from foreign keys, `geometry` on the stop half where the
 * ordinary create takes a `locationSource`.
 *
 * It is in its own file because it is the only action with a second table
 * hanging off it. An application records *which* insecticide and how much;
 * `application_batches` records which physical batches of that insecticide came
 * off the shelf, which is the tracking an agency turns on with the
 * `trackInsecticideBatches` setting.
 *
 * ## The two tables are not one map
 *
 * `application_batches` gets its own, because a link row is a row: adding a
 * batch to an application is an insert into a table a client syncs, not a field
 * on the application. That also puts the permission rules where they belong —
 * `addChemicalApplicationBatch` is checked against the *application's*
 * performer, and `removeChemicalApplicationBatch` has to reach the application
 * through the link row (`OWN_APPLICATION_VIA_BATCH` in `command-permissions.ts`).
 * Neither of those changes here; both are settled in the write transaction.
 *
 * ## Field names
 *
 * Postgres column names: `insecticide_id`, `amount_applied`,
 * `application_unit_id`, `application_date`, `applicator_profile_id`,
 * `application_method_id`, `vehicle_id`, `equipment_id`, and on the link row
 * `application_id` and `insecticide_batch_id`. `context`, `locationSource`,
 * `geometry`, `missionItemId` and the execution flags are instructions.
 */

import {
	addChemicalApplicationBatchCommand,
	type ControlActionContext,
	type ControlActionLocationSourceInput,
	type ControlOperationsCommand,
	deleteChemicalApplicationCommand,
	recordChemicalApplicationCommand,
	recordChemicalApplicationForMissionItemCommand,
	removeChemicalApplicationBatchCommand,
	updateChemicalApplicationFieldDetailsCommand,
	updateChemicalApplicationLocationAndContextCommand,
} from '@simmer-mosquito/domain';
import {
	readMissionExecutionOptions,
	readNullableText,
	readNumber,
	readText,
} from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import { writeApplicationBatchCommand } from '../control-operations-commands/chemical-application-batches.js';
import {
	type ApplicationCommand,
	writeApplicationCommand,
} from '../control-operations-commands/chemical-applications.js';
import type {
	SafeApplication,
	SafeApplicationBatch,
} from '../control-operations-commands/shared.js';
import type { TableCommands } from './dispatch.js';
import { acknowledged } from './shared.js';

function applicationContext(payload: Record<string, unknown>): ControlActionContext {
	return (payload.context ?? { kind: 'none' }) as ControlActionContext;
}

/** The product and dose half, which both creates take identically. */
function applicationFields(payload: Record<string, unknown>) {
	return {
		insecticideId: readText(payload.insecticide_id) ?? '',
		amountApplied: readNumber(payload.amount_applied) ?? Number.NaN,
		applicationUnitId: readText(payload.application_unit_id) ?? '',
		applicationDate: readText(payload.application_date) ?? '',
		applicatorProfileId: readNullableText(payload.applicator_profile_id),
		applicationMethodId: readNullableText(payload.application_method_id),
		vehicleId: readNullableText(payload.vehicle_id),
		equipmentId: readNullableText(payload.equipment_id),
	};
}

export function applicationTableCommands(
	db: CommandDb,
): TableCommands<ApplicationCommand, SafeApplication> {
	return {
		table: 'applications',
		run: {
			db,
			write: writeApplicationCommand,
			notFound: 'application_not_found',
			key: 'application',
		},
		intents: {
			'controlOperations.recordChemicalApplication': ({ payload, agency, id }) =>
				recordChemicalApplicationCommand({
					...agency,
					applicationId: id,
					...applicationFields(payload),
					locationSource: payload.locationSource as ControlActionLocationSourceInput,
					addressId: readNullableText(payload.address_id),
					context: applicationContext(payload),
					requestedControlActionId: readNullableText(payload.requested_control_action_id),
					metadata: payload.metadata ?? null,
				}),

			'missionDispatch.recordChemicalApplicationForMissionItem': ({ payload, agency, id }) =>
				recordChemicalApplicationForMissionItemCommand({
					...agency,
					applicationId: id,
					missionItemId: readText(payload.mission_item_id) ?? '',
					...applicationFields(payload),
					...(payload.geometry === undefined ? {} : { geometry: payload.geometry }),
					addressId: readNullableText(payload.address_id),
					// The record's own surveillance context, not the mission's — a
					// mission-recorded application stores the same as one recorded off a
					// stop, which it did not always.
					context: applicationContext(payload),
					requestedControlActionId: readNullableText(payload.requested_control_action_id),
					metadata: payload.metadata ?? null,
					...readMissionExecutionOptions(payload),
				}),

			'controlOperations.updateChemicalApplicationFieldDetails': ({ payload, agency, id }) =>
				updateChemicalApplicationFieldDetailsCommand({
					...agency,
					applicationId: id,
					...('application_date' in payload
						? { applicationDate: readText(payload.application_date) ?? '' }
						: {}),
					...('applicator_profile_id' in payload
						? { applicatorProfileId: readNullableText(payload.applicator_profile_id) }
						: {}),
					...('application_method_id' in payload
						? { applicationMethodId: readNullableText(payload.application_method_id) }
						: {}),
					...('insecticide_id' in payload
						? { insecticideId: readText(payload.insecticide_id) ?? '' }
						: {}),
					...('amount_applied' in payload
						? { amountApplied: readNumber(payload.amount_applied) ?? Number.NaN }
						: {}),
					...('application_unit_id' in payload
						? { applicationUnitId: readText(payload.application_unit_id) ?? '' }
						: {}),
					...('vehicle_id' in payload ? { vehicleId: readNullableText(payload.vehicle_id) } : {}),
					...('equipment_id' in payload
						? { equipmentId: readNullableText(payload.equipment_id) }
						: {}),
					...('metadata' in payload ? { metadata: payload.metadata ?? null } : {}),
					// Changing the product is what clears the batch links, since batches of
					// the old insecticide cannot describe the new one. The old PATCH
					// hard-coded this to `true`, so nobody could be asked.
					acknowledgedBatchClearance: acknowledged(payload.acknowledgedBatchClearance),
				}),

			'controlOperations.updateChemicalApplicationLocationAndContext': ({ payload, agency, id }) =>
				updateChemicalApplicationLocationAndContextCommand({
					...agency,
					applicationId: id,
					...('locationSource' in payload
						? { locationSource: payload.locationSource as ControlActionLocationSourceInput }
						: {}),
					...('address_id' in payload ? { addressId: readNullableText(payload.address_id) } : {}),
					...('context' in payload ? { context: applicationContext(payload) } : {}),
					...('requested_control_action_id' in payload
						? { requestedControlActionId: readNullableText(payload.requested_control_action_id) }
						: {}),
				}),

			'controlOperations.deleteChemicalApplication': ({ payload, agency, id }) =>
				deleteChemicalApplicationCommand({
					...agency,
					applicationId: id,
					acknowledgedSupportRecordDeletion: acknowledged(
						payload.acknowledgedSupportRecordDeletion,
					),
					acknowledgedBatchDeletion: acknowledged(payload.acknowledgedBatchDeletion),
				}),
		},
	};
}

export function applicationBatchTableCommands(
	db: CommandDb,
): TableCommands<ControlOperationsCommand, SafeApplicationBatch> {
	return {
		table: 'application_batches',
		run: {
			db,
			write: writeApplicationBatchCommand,
			notFound: 'application_batch_not_found',
			key: 'applicationBatch',
		},
		intents: {
			'controlOperations.addChemicalApplicationBatch': ({ payload, agency, id }) =>
				addChemicalApplicationBatchCommand({
					...agency,
					applicationBatchId: id,
					applicationId: readText(payload.application_id) ?? '',
					insecticideBatchId: readText(payload.insecticide_batch_id) ?? '',
				}),

			// Only the link row's id: which application it belonged to is what the
			// server looks up, and it is also how the permission check reaches the
			// application's performer.
			'controlOperations.removeChemicalApplicationBatch': ({ agency, id }) =>
				removeChemicalApplicationBatchCommand({ ...agency, applicationBatchId: id }),
		},
	};
}
