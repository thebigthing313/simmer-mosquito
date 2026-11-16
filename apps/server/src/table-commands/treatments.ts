/**
 * The `treatments` table, as commands (ADR 0020).
 *
 * A Treatment is one visit's insecticide work, and each Chemical Application
 * under it is one Insecticide and one amount. Every write to either goes
 * through here: `/commands/applications` and `/commands/application_batches`
 * accept nothing. The line set travels whole, as `applications`, each line
 * spelled as its row with its `application_batches` nested under it, because
 * nested child rows keep their column names on `/commands/{table}`. The server
 * diffs it against what is stored.
 *
 * Everything `performed-actions.ts` says about the other control actions holds
 * here too: the mission-stop create is chosen by name, `context` is taken whole,
 * and `geometry` is on the stop half where the ordinary create takes a
 * `locationSource`.
 *
 * ## Field names
 *
 * Postgres column names for what a column holds, the three Formulation columns
 * included: `formulation_id`, `mix_amount`, `mix_unit_id`. They travel together;
 * the domain builder refuses a set that is not whole. `context`,
 * `locationSource`, `geometry`, `applications` and the execution flags are
 * instructions. `docs/treatment-spec.md` is the rest.
 */

import {
	type ControlActionContext,
	type ControlActionLocationSourceInput,
	DomainValidationError,
	deleteTreatmentCommand,
	recordTreatmentCommand,
	recordTreatmentForMissionItemCommand,
	reviseTreatmentLinesCommand,
	type TreatmentApplicationRowInput,
	type TreatmentFormulationInput,
	updateTreatmentFieldDetailsCommand,
	updateTreatmentLocationAndContextCommand,
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
import type { TreatmentRow } from '../writers/control-operations/shared.js';
import {
	settleTreatmentWrites,
	type TreatmentCommand,
	writeTreatmentCommand,
} from '../writers/control-operations/treatments.js';
import type { TableCommands } from './dispatch.js';
import { acknowledged, drawnGeometry } from './shared.js';

/**
 * The keys a Treatment write reads that are not its columns: where it happened,
 * what it was for, and the line set. `applications` is `snake_case` because it
 * is that table's rows.
 */
type TreatmentArgument = 'locationSource' | 'geometry' | 'context' | 'applications';

/** The body of a write to this module's table. */
type TreatmentPayload = CommandPayload<'treatments', TreatmentArgument>;

function treatmentContext(payload: TreatmentPayload): ControlActionContext {
	return (payload.context ?? { kind: 'none' }) as ControlActionContext;
}

/**
 * The line set, read as rows.
 *
 * A malformed entry is passed through with empty ids rather than skipped. The
 * domain refuses the whole write and names the index; dropping it would write a
 * Treatment holding fewer products than the crew recorded, behind a 201. A value
 * that is not an array goes to the domain unchanged, which reports it.
 */
function treatmentLines(payload: TreatmentPayload): readonly TreatmentApplicationRowInput[] {
	const rows = payload.applications;
	if (!Array.isArray(rows)) {
		return rows as readonly TreatmentApplicationRowInput[];
	}
	return rows.map((row) => {
		const source = isRecord(row) ? row : {};
		const batches = source.application_batches;
		const line = {
			id: readText(source.id) ?? '',
			insecticide_id: readText(source.insecticide_id) ?? '',
			amount_applied: readNumber(source.amount_applied) ?? Number.NaN,
			application_unit_id: readText(source.application_unit_id) ?? '',
		};
		if (batches === undefined) {
			return line;
		}
		return {
			...line,
			application_batches: Array.isArray(batches)
				? batches.map((batch) => {
						const link = isRecord(batch) ? batch : {};
						return {
							id: readText(link.id) ?? '',
							insecticide_batch_id: readText(link.insecticide_batch_id) ?? '',
						};
					})
				: (batches as NonNullable<TreatmentApplicationRowInput['application_batches']>),
		};
	});
}

/**
 * The Formulation set as the body names it.
 *
 * A key the body left out stays out, so an edit naming none of the three leaves
 * the stored reference alone. `null` is kept as `null`, which is how a crew
 * switching to product by product clears it. A value of the wrong type reads as
 * an empty id or `NaN`, which the domain refuses by name.
 */
function treatmentFormulation(payload: TreatmentPayload): TreatmentFormulationInput {
	return {
		...namedOrCleared('formulationId', payload.formulation_id, readId),
		...namedOrCleared('mixAmount', payload.mix_amount, readAmount),
		...namedOrCleared('mixUnitId', payload.mix_unit_id, readId),
	};
}

const readId = (value: unknown): string => readText(value) ?? '';
const readAmount = (value: unknown): number => readNumber(value) ?? Number.NaN;

/** `{ key: value }` read, `{ key: null }` when the body sent null, nothing when it sent nothing. */
function namedOrCleared<TKey extends string, TValue>(
	key: TKey,
	value: unknown,
	read: (value: unknown) => TValue,
): Partial<Record<TKey, TValue | null>> {
	if (value === undefined) {
		return {};
	}
	return { [key]: value === null ? null : read(value) } as Partial<Record<TKey, TValue | null>>;
}

/**
 * The geometry override a mission-stop create may carry, spread only when there
 * is one: the stop's own ground is the default, and an explicit `undefined`
 * would read as an instruction to clear it.
 */
function missionGeometry(payload: TreatmentPayload): { readonly geometry?: unknown } {
	const geometry = payload.geometry ?? drawnGeometry(payload.locationSource);
	return geometry === undefined ? {} : { geometry };
}

/**
 * Refuse an edit that names the mission stop.
 *
 * A Treatment recorded off a stop is what closed that stop, so the link is
 * fixed at create (ADR 0020). No edit intent takes the column; refusing it by
 * name is what stops a client reading the silence as a save.
 */
function refuseMissionItemChange(payload: TreatmentPayload): void {
	if (payload.mission_item_id !== undefined) {
		throw new DomainValidationError('A treatment edit cannot change its mission stop.', [
			{
				path: 'mission_item_id',
				message: 'The mission stop is fixed when the treatment is recorded.',
			},
		]);
	}
}

/** The visit half both creates take identically. */
function treatmentFields(payload: TreatmentPayload) {
	return {
		applicationDate: readText(payload.application_date) ?? '',
		applicatorProfileId: readNullableText(payload.applicator_profile_id),
		applicationMethodId: readNullableText(payload.application_method_id),
		vehicleId: readNullableText(payload.vehicle_id),
		equipmentId: readNullableText(payload.equipment_id),
		...treatmentFormulation(payload),
		applications: treatmentLines(payload),
	};
}

export function treatmentTableCommands(
	db: CommandDb,
): TableCommands<'treatments', TreatmentCommand, TreatmentRow, TreatmentArgument> {
	return {
		table: 'treatments',
		run: {
			db,
			write: writeTreatmentCommand,
			settle: settleTreatmentWrites,
			notFound: 'treatment_not_found',
			key: 'treatment',
		},
		intents: {
			'controlOperations.recordTreatment': ({ payload, organization, id }) =>
				recordTreatmentCommand({
					...organization,
					treatmentId: id,
					...treatmentFields(payload),
					locationSource: payload.locationSource as ControlActionLocationSourceInput,
					addressId: readNullableText(payload.address_id),
					context: treatmentContext(payload),
					requestedControlActionId: readNullableText(payload.requested_control_action_id),
					metadata: payload.metadata ?? null,
				}),

			'missionDispatch.recordTreatmentForMissionItem': ({ payload, organization, id }) =>
				recordTreatmentForMissionItemCommand({
					...organization,
					treatmentId: id,
					missionItemId: readText(payload.mission_item_id) ?? '',
					...treatmentFields(payload),
					...missionGeometry(payload),
					addressId: readNullableText(payload.address_id),
					context: treatmentContext(payload),
					requestedControlActionId: readNullableText(payload.requested_control_action_id),
					metadata: payload.metadata ?? null,
					...readMissionExecutionOptions(payload),
				}),

			'controlOperations.updateTreatmentFieldDetails': ({ payload, organization, id }) => {
				refuseMissionItemChange(payload);
				return updateTreatmentFieldDetailsCommand({
					...organization,
					treatmentId: id,
					...(payload.application_date !== undefined
						? { applicationDate: readText(payload.application_date) ?? '' }
						: {}),
					...(payload.applicator_profile_id !== undefined
						? { applicatorProfileId: readNullableText(payload.applicator_profile_id) }
						: {}),
					...(payload.application_method_id !== undefined
						? { applicationMethodId: readNullableText(payload.application_method_id) }
						: {}),
					...(payload.vehicle_id !== undefined
						? { vehicleId: readNullableText(payload.vehicle_id) }
						: {}),
					...(payload.equipment_id !== undefined
						? { equipmentId: readNullableText(payload.equipment_id) }
						: {}),
					...(payload.metadata !== undefined ? { metadata: payload.metadata ?? null } : {}),
					...treatmentFormulation(payload),
				});
			},

			'controlOperations.updateTreatmentLocationAndContext': ({ payload, organization, id }) => {
				refuseMissionItemChange(payload);
				return updateTreatmentLocationAndContextCommand({
					...organization,
					treatmentId: id,
					...(payload.locationSource !== undefined
						? { locationSource: payload.locationSource as ControlActionLocationSourceInput }
						: {}),
					...(payload.address_id !== undefined
						? { addressId: readNullableText(payload.address_id) }
						: {}),
					...(payload.context !== undefined ? { context: treatmentContext(payload) } : {}),
					...(payload.requested_control_action_id !== undefined
						? { requestedControlActionId: readNullableText(payload.requested_control_action_id) }
						: {}),
				});
			},

			// The whole set the Treatment should have afterwards, and nothing else:
			// a header key beside it is the header intents' to read, and naming
			// both in one PATCH is how a save commits them together.
			'controlOperations.reviseTreatmentLines': ({ payload, organization, id }) => {
				refuseMissionItemChange(payload);
				return reviseTreatmentLinesCommand({
					...organization,
					treatmentId: id,
					applications: treatmentLines(payload),
				});
			},

			// No flag for the lines: a Treatment's lines go with it. Batch links and
			// support records are what the organization recorded on top, so those ask.
			'controlOperations.deleteTreatment': ({ payload, organization, id }) =>
				deleteTreatmentCommand({
					...organization,
					treatmentId: id,
					acknowledgedSupportRecordDeletion: acknowledged(
						payload,
						'acknowledgedSupportRecordDeletion',
					),
					acknowledgedBatchDeletion: acknowledged(payload, 'acknowledgedBatchDeletion'),
				}),
		},
	};
}
