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
 * off the shelf, which is the tracking an organization turns on with the
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
 * The one exception is the batches an application is *created* with, which ride
 * in the create's own payload. They have to: a link row names the application, so
 * it cannot be written before the application exists, and `recordChemicalApplication`
 * is one command that inserts both inside one Postgres transaction. Sending them
 * afterwards as separate commands is what the client used to do, and it is how an
 * application ends up saved with none of its batches attached.
 *
 * ## Field names
 *
 * Postgres column names: `insecticide_id`, `amount_applied`,
 * `application_unit_id`, `application_date`, `applicator_profile_id`,
 * `application_method_id`, `vehicle_id`, `equipment_id`, and on the link row
 * `application_id` and `insecticide_batch_id`. A create carries its links under
 * `application_batches`, each spelled as the row it becomes — `id` and
 * `insecticide_batch_id`. `context`, `locationSource`, `geometry`,
 * `missionItemId` and the execution flags are instructions.
 */

import {
	type ApplicationBatchInput,
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
	type CommandPayload,
	isRecord,
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
import type { ApplicationBatchRow, ApplicationRow } from '../control-operations-commands/shared.js';
import type { TableCommands } from './dispatch.js';
import { acknowledged, drawnGeometry } from './shared.js';

/**
 * The keys an application write reads that are not its columns: where it
 * happened, what it was for, and the batch rows a create carries with it.
 * `application_batches` is `snake_case` because it is that table's rows.
 */
type ApplicationArgument = 'locationSource' | 'geometry' | 'context' | 'application_batches';

/** The body of a write to this module's table. */
type ApplicationPayload = CommandPayload<'applications', ApplicationArgument>;

function applicationContext(payload: ApplicationPayload): ControlActionContext {
	return (payload.context ?? { kind: 'none' }) as ControlActionContext;
}

/**
 * The batch links created with the application.
 *
 * Child rows rather than instructions, so they are spelled as rows: `id` and
 * `insecticide_batch_id`, the columns `application_batches` actually has. Only a
 * create takes them. An edit adds and removes links one at a time through that
 * table's own commands, which is why there is no reader for them on the two
 * update intents.
 *
 * A malformed entry is passed through as empty ids rather than skipped. The
 * domain refuses the whole create and names the index; dropping it would write
 * an application holding fewer batches than the crew recorded, behind a 201.
 */
function applicationBatches(payload: ApplicationPayload): readonly ApplicationBatchInput[] {
	const rows = payload.application_batches;

	if (rows === undefined) {
		return [];
	}

	if (!Array.isArray(rows)) {
		// Handed over unchanged: "not an array" is an issue the domain already
		// reports, and reporting it here as well would be a second copy of the rule.
		return rows as readonly ApplicationBatchInput[];
	}

	return rows.map((row) => {
		const source = isRecord(row) ? row : {};
		return {
			applicationBatchId: readText(source.id) ?? '',
			insecticideBatchId: readText(source.insecticide_batch_id) ?? '',
		};
	});
}

/**
 * The geometry override a mission-stop create may carry.
 *
 * Spread only when there is one: the stop's own ground is the default, and an
 * explicit `undefined` would read as an instruction to clear it. A client states
 * its location as a `locationSource` like it does everywhere else, and
 * `drawnGeometry` unwraps it — an outright `geometry` is honoured too, since that
 * is what the domain command itself takes.
 */
function missionGeometry(payload: ApplicationPayload): { readonly geometry?: unknown } {
	const geometry = payload.geometry ?? drawnGeometry(payload.locationSource);
	return geometry === undefined ? {} : { geometry };
}

/** The product and dose half, which both creates take identically. */
function applicationFields(payload: ApplicationPayload) {
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
): TableCommands<'applications', ApplicationCommand, ApplicationRow, ApplicationArgument> {
	return {
		table: 'applications',
		run: {
			db,
			write: writeApplicationCommand,
			notFound: 'application_not_found',
			key: 'application',
		},
		intents: {
			'controlOperations.recordChemicalApplication': ({ payload, organization, id }) =>
				recordChemicalApplicationCommand({
					...organization,
					applicationId: id,
					...applicationFields(payload),
					applicationBatches: applicationBatches(payload),
					locationSource: payload.locationSource as ControlActionLocationSourceInput,
					addressId: readNullableText(payload.address_id),
					context: applicationContext(payload),
					requestedControlActionId: readNullableText(payload.requested_control_action_id),
					metadata: payload.metadata ?? null,
				}),

			'missionDispatch.recordChemicalApplicationForMissionItem': ({ payload, organization, id }) =>
				recordChemicalApplicationForMissionItemCommand({
					...organization,
					applicationId: id,
					missionItemId: readText(payload.mission_item_id) ?? '',
					...applicationFields(payload),
					applicationBatches: applicationBatches(payload),
					...missionGeometry(payload),
					addressId: readNullableText(payload.address_id),
					// The record's own surveillance context, not the mission's — a
					// mission-recorded application stores the same as one recorded off a
					// stop, which it did not always.
					context: applicationContext(payload),
					requestedControlActionId: readNullableText(payload.requested_control_action_id),
					metadata: payload.metadata ?? null,
					...readMissionExecutionOptions(payload),
				}),

			'controlOperations.updateChemicalApplicationFieldDetails': ({ payload, organization, id }) =>
				updateChemicalApplicationFieldDetailsCommand({
					...organization,
					applicationId: id,
					...(payload.application_date !== undefined
						? { applicationDate: readText(payload.application_date) ?? '' }
						: {}),
					...(payload.applicator_profile_id !== undefined
						? { applicatorProfileId: readNullableText(payload.applicator_profile_id) }
						: {}),
					...(payload.application_method_id !== undefined
						? { applicationMethodId: readNullableText(payload.application_method_id) }
						: {}),
					...(payload.insecticide_id !== undefined
						? { insecticideId: readText(payload.insecticide_id) ?? '' }
						: {}),
					...(payload.amount_applied !== undefined
						? { amountApplied: readNumber(payload.amount_applied) ?? Number.NaN }
						: {}),
					...(payload.application_unit_id !== undefined
						? { applicationUnitId: readText(payload.application_unit_id) ?? '' }
						: {}),
					...(payload.vehicle_id !== undefined
						? { vehicleId: readNullableText(payload.vehicle_id) }
						: {}),
					...(payload.equipment_id !== undefined
						? { equipmentId: readNullableText(payload.equipment_id) }
						: {}),
					...(payload.metadata !== undefined ? { metadata: payload.metadata ?? null } : {}),
					// Changing the product is what clears the batch links, since batches of
					// the old insecticide cannot describe the new one. The old PATCH
					// hard-coded this to `true`, so nobody could be asked.
					acknowledgedBatchClearance: acknowledged(payload, 'acknowledgedBatchClearance'),
				}),

			'controlOperations.updateChemicalApplicationLocationAndContext': ({
				payload,
				organization,
				id,
			}) =>
				updateChemicalApplicationLocationAndContextCommand({
					...organization,
					applicationId: id,
					...(payload.locationSource !== undefined
						? { locationSource: payload.locationSource as ControlActionLocationSourceInput }
						: {}),
					...(payload.address_id !== undefined
						? { addressId: readNullableText(payload.address_id) }
						: {}),
					...(payload.context !== undefined ? { context: applicationContext(payload) } : {}),
					...(payload.requested_control_action_id !== undefined
						? { requestedControlActionId: readNullableText(payload.requested_control_action_id) }
						: {}),
				}),

			'controlOperations.deleteChemicalApplication': ({ payload, organization, id }) =>
				deleteChemicalApplicationCommand({
					...organization,
					applicationId: id,
					acknowledgedSupportRecordDeletion: acknowledged(
						payload,
						'acknowledgedSupportRecordDeletion',
					),
					acknowledgedBatchDeletion: acknowledged(payload, 'acknowledgedBatchDeletion'),
				}),
		},
	};
}

export function applicationBatchTableCommands(
	db: CommandDb,
): TableCommands<'application_batches', ControlOperationsCommand, ApplicationBatchRow> {
	return {
		table: 'application_batches',
		run: {
			db,
			write: writeApplicationBatchCommand,
			notFound: 'application_batch_not_found',
			key: 'applicationBatch',
		},
		intents: {
			'controlOperations.addChemicalApplicationBatch': ({ payload, organization, id }) =>
				addChemicalApplicationBatchCommand({
					...organization,
					applicationBatchId: id,
					applicationId: readText(payload.application_id) ?? '',
					insecticideBatchId: readText(payload.insecticide_batch_id) ?? '',
				}),

			// Only the link row's id: which application it belonged to is what the
			// server looks up, and it is also how the permission check reaches the
			// application's performer.
			'controlOperations.removeChemicalApplicationBatch': ({ organization, id }) =>
				removeChemicalApplicationBatchCommand({ ...organization, applicationBatchId: id }),
		},
	};
}
