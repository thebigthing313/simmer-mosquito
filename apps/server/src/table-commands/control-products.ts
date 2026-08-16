/**
 * The four product tables, as commands.
 *
 * `insecticides` and `insecticide_batches` — the chemical and the drums of it
 * that came off the shelf — plus `formulations` and `formulation_insecticides`,
 * a recipe and what goes in it. Twenty-three commands, and the last of control
 * operations.
 *
 * ## Two link-row pairs, read the same way
 *
 * `formulation_insecticides` is the same shape as `application_batches`: a row
 * joining two others with a quantity on it. Both get their own map for the same
 * reason — a client syncs the link, so writing one is an insert rather than a
 * field on the parent. The difference is that removing a formulation's last
 * component can deactivate the formulation, which is what
 * `acknowledgedDeactivateEmptyFormulation` is for, and it rides on both the
 * update and the remove.
 *
 * ## Two columns no command reaches
 *
 * `insecticides` carries `inventory_unit_id` and `conversion_factor`, and
 * nothing in the command vocabulary writes either — not the old routes, not the
 * domain builders, not `packages/db`. They are left out here rather than
 * guessed at. Worth knowing before someone adds a form field for them and
 * wonders why the save does nothing.
 *
 * ## Field names
 *
 * Postgres column names: `trade_name`, `active_ingredient`, `type`,
 * `registration_number`, `default_unit_id`, `label_url`, `msds_url`,
 * `shorthand`, `batch_name`, `formulation_name`, `batch_size`, `batch_unit_id`,
 * `amount`, `unit_id`. Nothing here is geometry or a lifecycle instruction, so
 * there is no camelCase exception in the whole file.
 */

import {
	activateFormulationCommand,
	addFormulationInsecticideCommand,
	type ControlOperationsCommand,
	createFormulationCommand,
	createInsecticideBatchCommand,
	createInsecticideCommand,
	deactivateFormulationCommand,
	deactivateInsecticideBatchCommand,
	deactivateInsecticideCommand,
	deleteFormulationCommand,
	deleteInsecticideBatchCommand,
	deleteInsecticideCommand,
	reactivateInsecticideBatchCommand,
	reactivateInsecticideCommand,
	removeFormulationInsecticideCommand,
	updateFormulationDetailsCommand,
	updateFormulationInsecticideCommand,
	updateInsecticideBatchCommand,
	updateInsecticideCommand,
} from '@simmer-mosquito/domain';
import { readNullableText, readNumber, readText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import { writeFormulationInsecticideCommand } from '../control-operations-commands/formulation-insecticides.js';
import { writeFormulationCommand } from '../control-operations-commands/formulations.js';
import type {
	SafeFormulation,
	SafeFormulationInsecticide,
} from '../control-operations-commands/shared.js';
import {
	type InsecticideBatchCommand,
	type InsecticideCommand,
	toInsecticideBatchResponse,
	toInsecticideResponse,
	writeInsecticideBatchCommand,
	writeInsecticideCommand,
} from '../control-product-commands.js';
import type { TableCommands } from './dispatch.js';
import { acknowledged } from './shared.js';

type InsecticideResponse = NonNullable<ReturnType<typeof toInsecticideResponse>>;
type InsecticideBatchResponse = NonNullable<ReturnType<typeof toInsecticideBatchResponse>>;

export function insecticideTableCommands(
	db: CommandDb,
): TableCommands<InsecticideCommand, InsecticideResponse> {
	return {
		table: 'insecticides',
		run: {
			db,
			write: async (trx, command) =>
				toInsecticideResponse(await writeInsecticideCommand(trx, command)),
			notFound: 'insecticide_not_found',
			key: 'insecticide',
		},
		intents: {
			'controlOperations.createInsecticide': ({ payload, agency, id }) =>
				createInsecticideCommand({
					...agency,
					insecticideId: id,
					tradeName: readText(payload.trade_name) ?? '',
					activeIngredient: readText(payload.active_ingredient) ?? '',
					// Untyped: which four types exist is the domain's list, and the enum
					// column's own default is not this layer's to restate.
					type: (readText(payload.type) ?? '') as never,
					registrationNumber: readText(payload.registration_number) ?? '',
					defaultUnitId: readText(payload.default_unit_id) ?? '',
					labelUrl: readNullableText(payload.label_url),
					msdsUrl: readNullableText(payload.msds_url),
					shorthand: readNullableText(payload.shorthand),
					metadata: payload.metadata ?? null,
				}),

			'controlOperations.updateInsecticide': ({ payload, agency, id }) =>
				updateInsecticideCommand({
					...agency,
					insecticideId: id,
					...('trade_name' in payload ? { tradeName: readText(payload.trade_name) ?? '' } : {}),
					...('active_ingredient' in payload
						? { activeIngredient: readText(payload.active_ingredient) ?? '' }
						: {}),
					...('type' in payload ? { type: (readText(payload.type) ?? '') as never } : {}),
					...('registration_number' in payload
						? { registrationNumber: readText(payload.registration_number) ?? '' }
						: {}),
					...('default_unit_id' in payload
						? { defaultUnitId: readText(payload.default_unit_id) ?? '' }
						: {}),
					// Present-and-null clears a label or safety-sheet link; absent leaves it.
					...('label_url' in payload ? { labelUrl: readNullableText(payload.label_url) } : {}),
					...('msds_url' in payload ? { msdsUrl: readNullableText(payload.msds_url) } : {}),
					...('shorthand' in payload ? { shorthand: readNullableText(payload.shorthand) } : {}),
					...('metadata' in payload ? { metadata: payload.metadata ?? null } : {}),
					acknowledgedHistoricalProductChange: acknowledged(
						payload.acknowledgedHistoricalProductChange,
					),
				}),

			// Retiring a product takes its batches and formulations with it, which is
			// what the acknowledgement is about — and why deactivating carries one
			// where reactivating does not.
			'controlOperations.deactivateInsecticide': ({ payload, agency, id }) =>
				deactivateInsecticideCommand({
					...agency,
					insecticideId: id,
					acknowledgedDependentDeactivation: acknowledged(
						payload.acknowledgedDependentDeactivation,
					),
				}),

			'controlOperations.reactivateInsecticide': ({ agency, id }) =>
				reactivateInsecticideCommand({ ...agency, insecticideId: id }),

			'controlOperations.deleteInsecticide': ({ agency, id }) =>
				deleteInsecticideCommand({ ...agency, insecticideId: id }),
		},
	};
}

export function insecticideBatchTableCommands(
	db: CommandDb,
): TableCommands<InsecticideBatchCommand, InsecticideBatchResponse> {
	return {
		table: 'insecticide_batches',
		run: {
			db,
			write: async (trx, command) =>
				toInsecticideBatchResponse(await writeInsecticideBatchCommand(trx, command)),
			notFound: 'insecticide_batch_not_found',
			key: 'batch',
		},
		intents: {
			'controlOperations.createInsecticideBatch': ({ payload, agency, id }) =>
				createInsecticideBatchCommand({
					...agency,
					insecticideBatchId: id,
					insecticideId: readText(payload.insecticide_id) ?? '',
					batchName: readText(payload.batch_name) ?? '',
				}),

			// A batch name is what an application's record is read back under, so
			// renaming one is the same kind of edit a trap code is.
			'controlOperations.updateInsecticideBatch': ({ payload, agency, id }) =>
				updateInsecticideBatchCommand({
					...agency,
					insecticideBatchId: id,
					...('batch_name' in payload ? { batchName: readText(payload.batch_name) ?? '' } : {}),
					acknowledgedHistoricalBatchLabelChange: acknowledged(
						payload.acknowledgedHistoricalBatchLabelChange,
					),
				}),

			'controlOperations.deactivateInsecticideBatch': ({ agency, id }) =>
				deactivateInsecticideBatchCommand({ ...agency, insecticideBatchId: id }),

			'controlOperations.reactivateInsecticideBatch': ({ agency, id }) =>
				reactivateInsecticideBatchCommand({ ...agency, insecticideBatchId: id }),

			'controlOperations.deleteInsecticideBatch': ({ agency, id }) =>
				deleteInsecticideBatchCommand({ ...agency, insecticideBatchId: id }),
		},
	};
}

export function formulationTableCommands(
	db: CommandDb,
): TableCommands<ControlOperationsCommand, SafeFormulation> {
	return {
		table: 'formulations',
		run: {
			db,
			write: writeFormulationCommand,
			notFound: 'formulation_not_found',
			key: 'formulation',
		},
		intents: {
			'controlOperations.createFormulation': ({ payload, agency, id }) =>
				createFormulationCommand({
					...agency,
					formulationId: id,
					formulationName: readText(payload.formulation_name) ?? '',
					description: readNullableText(payload.description),
					// What one batch of the mix makes — 26 gallons of spray.
					batchSize: readNumber(payload.batch_size) ?? Number.NaN,
					batchUnitId: readText(payload.batch_unit_id) ?? '',
				}),

			'controlOperations.updateFormulationDetails': ({ payload, agency, id }) =>
				updateFormulationDetailsCommand({
					...agency,
					formulationId: id,
					...('formulation_name' in payload
						? { formulationName: readText(payload.formulation_name) ?? '' }
						: {}),
					...('description' in payload
						? { description: readNullableText(payload.description) }
						: {}),
					...('batch_size' in payload
						? { batchSize: readNumber(payload.batch_size) ?? Number.NaN }
						: {}),
					...('batch_unit_id' in payload
						? { batchUnitId: readText(payload.batch_unit_id) ?? '' }
						: {}),
				}),

			// `activate`, not `reactivate` — a formulation can be deactivated by the
			// system when its last component is removed, so turning one back on is not
			// always undoing a person's decision.
			'controlOperations.activateFormulation': ({ agency, id }) =>
				activateFormulationCommand({ ...agency, formulationId: id }),

			'controlOperations.deactivateFormulation': ({ agency, id }) =>
				deactivateFormulationCommand({ ...agency, formulationId: id }),

			'controlOperations.deleteFormulation': ({ payload, agency, id }) =>
				deleteFormulationCommand({
					...agency,
					formulationId: id,
					acknowledgedComponentDeletion: acknowledged(payload.acknowledgedComponentDeletion),
				}),
		},
	};
}

export function formulationInsecticideTableCommands(
	db: CommandDb,
): TableCommands<ControlOperationsCommand, SafeFormulationInsecticide> {
	return {
		table: 'formulation_insecticides',
		run: {
			db,
			write: writeFormulationInsecticideCommand,
			notFound: 'formulation_insecticide_not_found',
			key: 'formulationInsecticide',
		},
		intents: {
			'controlOperations.addFormulationInsecticide': ({ payload, agency, id }) =>
				addFormulationInsecticideCommand({
					...agency,
					formulationInsecticideId: id,
					formulationId: readText(payload.formulation_id) ?? '',
					insecticideId: readText(payload.insecticide_id) ?? '',
					// How much of this product one batch takes, in `unit_id`.
					amount: readNumber(payload.amount) ?? Number.NaN,
					unitId: readText(payload.unit_id) ?? '',
				}),

			// Changing a component to a different product, or to an amount of zero,
			// can leave the formulation with nothing in it — which deactivates it.
			// That is what the acknowledgement is for, and why it rides on the edit as
			// well as the removal.
			'controlOperations.updateFormulationInsecticide': ({ payload, agency, id }) =>
				updateFormulationInsecticideCommand({
					...agency,
					formulationInsecticideId: id,
					...('insecticide_id' in payload
						? { insecticideId: readText(payload.insecticide_id) ?? '' }
						: {}),
					...('amount' in payload ? { amount: readNumber(payload.amount) ?? Number.NaN } : {}),
					...('unit_id' in payload ? { unitId: readText(payload.unit_id) ?? '' } : {}),
					acknowledgedDeactivateEmptyFormulation: acknowledged(
						payload.acknowledgedDeactivateEmptyFormulation,
					),
				}),

			'controlOperations.removeFormulationInsecticide': ({ payload, agency, id }) =>
				removeFormulationInsecticideCommand({
					...agency,
					formulationInsecticideId: id,
					acknowledgedDeactivateEmptyFormulation: acknowledged(
						payload.acknowledgedDeactivateEmptyFormulation,
					),
				}),
		},
	};
}
