/**
 * The Treatment commands: one visit's insecticide work, with one Chemical
 * Application under it for each Insecticide that went out (ADR 0020).
 *
 * Create and revise carry the whole line set as `applications`, each line
 * spelled as its row with its `application_batches` nested under it. The
 * builders refuse what needs no database to refuse: an empty set, a repeated
 * Insecticide, a Formulation reference that is not whole. Everything that does
 * (the recipe check, a batch matching its line, catalog lifecycle) is the
 * server's. `docs/treatment-spec.md` is the rest.
 */
import {
	basePayload,
	createIssues,
	jsonObject as normalizeMetadata,
	optionalUuid as normalizeOptionalUuid,
	requiredId as normalizeRequiredId,
	requiredUuid as requireUuid,
	throwIfIssues,
	validateBase,
	validateIdCommand,
} from '../command-validation.js';
import {
	type ControlActionLocationSource,
	type ControlActionLocationSourceInput,
	validateLocationSourceInput,
} from '../location-intent.js';
import {
	type ControlActionContext,
	normalizeTreatmentApplications,
	normalizeTreatmentFields,
	normalizeTreatmentFormulationChange,
	type TreatmentApplicationBatchRow,
	type TreatmentApplicationRow,
	type TreatmentApplicationRowInput,
	type TreatmentFormulation,
	type TreatmentFormulationInput,
	validateControlActionContext,
} from '../performed-control-actions.js';
import type { DomainId, JsonObject, LocalDateString } from '../shared.js';
import {
	jsonObjectField,
	localDateField,
	normalizeUpdateFields,
	nullableReferenceIdField,
	type UpdateFieldSet,
	type UpdateFieldsChanges,
	type UpdateFieldsInput,
} from '../update-command-fields.js';
import type {
	ControlCommandInput,
	ControlCommandPayload,
	ControlOperationsDomainCommand,
} from './core.js';
import {
	locationContextChanges,
	normalizePositiveFiniteNumber,
	validateLocationContextPatchBase,
} from './core.js';
import {
	type CalculateFormulationComponentAmountsInput,
	calculateFormulationComponentAmounts,
	type FormulationComponentAmountInput,
} from './products.js';

export interface RecordTreatmentCommandInput
	extends ControlCommandInput,
		TreatmentFormulationInput {
	readonly treatmentId: DomainId;
	readonly applicationDate: LocalDateString;
	readonly applicatorProfileId?: DomainId | null;
	readonly locationSource: ControlActionLocationSourceInput;
	readonly addressId?: DomainId | null;
	readonly context?: ControlActionContext;
	readonly requestedControlActionId?: DomainId | null;
	readonly applicationMethodId?: DomainId | null;
	readonly vehicleId?: DomainId | null;
	readonly equipmentId?: DomainId | null;
	readonly metadata?: unknown | null;
	readonly applications: readonly TreatmentApplicationRowInput[];
}

export type RecordTreatmentCommand = ControlOperationsDomainCommand<
	'controlOperations.recordTreatment',
	ControlCommandPayload &
		TreatmentFormulation & {
			readonly treatmentId: DomainId;
			readonly applicationDate: LocalDateString;
			readonly applicatorProfileId: DomainId;
			readonly locationSource: ControlActionLocationSource;
			readonly addressId: DomainId | null;
			readonly context: ControlActionContext;
			readonly requestedControlActionId: DomainId | null;
			readonly applicationMethodId: DomainId | null;
			readonly vehicleId: DomainId | null;
			readonly equipmentId: DomainId | null;
			readonly metadata: JsonObject | null;
			readonly applications: readonly TreatmentApplicationRow[];
		}
>;

/**
 * The header fields `updateTreatmentFieldDetails` owns besides the Formulation
 * set. The set is not a descriptor field because its three keys change together,
 * which no single normalizer can see.
 */
export const TREATMENT_UPDATE_FIELDS = {
	applicationDate: localDateField,
	applicatorProfileId: nullableReferenceIdField,
	applicationMethodId: nullableReferenceIdField,
	vehicleId: nullableReferenceIdField,
	equipmentId: nullableReferenceIdField,
	metadata: jsonObjectField,
} satisfies UpdateFieldSet;

export type UpdateTreatmentFieldDetailsCommandInput = ControlCommandInput &
	UpdateFieldsInput<typeof TREATMENT_UPDATE_FIELDS> &
	TreatmentFormulationInput & {
		readonly treatmentId: DomainId;
	};

/** The Formulation set appears in `changes` whole, or not at all. */
export type TreatmentFieldDetailsChanges = UpdateFieldsChanges<typeof TREATMENT_UPDATE_FIELDS> &
	Partial<TreatmentFormulation>;

export type UpdateTreatmentFieldDetailsCommand = ControlOperationsDomainCommand<
	'controlOperations.updateTreatmentFieldDetails',
	ControlCommandPayload & {
		readonly treatmentId: DomainId;
		readonly changes: TreatmentFieldDetailsChanges;
	}
>;

export interface UpdateTreatmentLocationAndContextCommandInput extends ControlCommandInput {
	readonly treatmentId: DomainId;
	readonly locationSource?: ControlActionLocationSourceInput;
	readonly addressId?: DomainId | null;
	readonly context?: ControlActionContext;
	readonly requestedControlActionId?: DomainId | null;
}

export type UpdateTreatmentLocationAndContextCommand = ControlOperationsDomainCommand<
	'controlOperations.updateTreatmentLocationAndContext',
	ControlCommandPayload & {
		readonly treatmentId: DomainId;
		readonly changes: Readonly<{
			readonly locationSource?: ControlActionLocationSource;
			readonly addressId?: DomainId | null;
			readonly context?: ControlActionContext;
			readonly requestedControlActionId?: DomainId | null;
		}>;
	}
>;

export interface ReviseTreatmentLinesCommandInput extends ControlCommandInput {
	readonly treatmentId: DomainId;
	/** Every line the Treatment should have afterwards; the server diffs it. */
	readonly applications: readonly TreatmentApplicationRowInput[];
}

export type ReviseTreatmentLinesCommand = ControlOperationsDomainCommand<
	'controlOperations.reviseTreatmentLines',
	ControlCommandPayload & {
		readonly treatmentId: DomainId;
		readonly applications: readonly TreatmentApplicationRow[];
	}
>;

export interface DeleteTreatmentCommandInput extends ControlCommandInput {
	readonly treatmentId: DomainId;
	readonly acknowledgedSupportRecordDeletion?: boolean;
	readonly acknowledgedBatchDeletion?: boolean;
}

export type DeleteTreatmentCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteTreatment',
	ControlCommandPayload & {
		readonly treatmentId: DomainId;
		readonly acknowledgedSupportRecordDeletion: boolean;
		readonly acknowledgedBatchDeletion: boolean;
	}
>;

/** One recipe component, with the line it becomes. */
export interface FormulationTreatmentComponentInput extends FormulationComponentAmountInput {
	/** The id of the Chemical Application this component is recorded as. */
	readonly applicationId: DomainId;
	readonly applicationBatches?: readonly TreatmentApplicationBatchRow[];
}

export interface FormulationTreatmentApplicationsInput
	extends Omit<CalculateFormulationComponentAmountsInput, 'totalAmount' | 'components'> {
	/** How much finished mix went out, in the Formulation's batch unit. */
	readonly mixAmount: number;
	readonly components: readonly FormulationTreatmentComponentInput[];
}

export type RecordTreatmentFromFormulationCommandInput = Omit<
	RecordTreatmentCommandInput,
	'applications' | 'formulationId' | 'mixAmount' | 'mixUnitId'
> &
	FormulationTreatmentApplicationsInput & {
		readonly formulationId: DomainId;
		/** The Formulation's `batch_unit_id`, which the server checks. */
		readonly mixUnitId: DomainId;
	};

export function recordTreatmentCommand(input: RecordTreatmentCommandInput): RecordTreatmentCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.treatmentId, 'treatmentId', issues);
	const locationSource = validateLocationSourceInput(input, 'controlAction', issues);
	const metadata = normalizeMetadata(input.metadata, 'metadata', issues);
	const context = validateControlActionContext(
		input.context ?? { kind: 'none' },
		'chemicalApplication',
		issues,
	);
	const fields = normalizeTreatmentFields(input, issues);
	const addressId = normalizeOptionalUuid(input.addressId, 'addressId', issues);
	const requestedControlActionId = normalizeOptionalUuid(
		input.requestedControlActionId,
		'requestedControlActionId',
		issues,
	);
	throwIfIssues('Record treatment command is invalid.', issues);
	return {
		type: 'controlOperations.recordTreatment',
		payload: {
			...basePayload(input),
			treatmentId: normalizeRequiredId(input.treatmentId),
			applicationDate: fields.applicationDate,
			applicatorProfileId: fields.applicatorProfileId,
			locationSource,
			addressId,
			context,
			requestedControlActionId,
			applicationMethodId: fields.applicationMethodId,
			vehicleId: fields.vehicleId,
			equipmentId: fields.equipmentId,
			metadata,
			...fields.formulation,
			applications: fields.applications,
		},
	};
}

/**
 * A Formulation's recipe scaled to the mix that went out, as a Treatment's lines.
 *
 * One line per component, in the recipe's order and each in its product's own
 * unit, at the amount `calculateFormulationComponentAmounts` gives. The server
 * computes the same lines from the same recipe and compares them exactly, so a
 * client building lines any other way would be refused.
 */
export function formulationTreatmentApplications(
	input: FormulationTreatmentApplicationsInput,
): readonly TreatmentApplicationRow[] {
	const issues = createIssues();
	normalizePositiveFiniteNumber(input.mixAmount, 'mixAmount', issues);
	throwIfIssues('Formulation treatment lines are invalid.', issues);
	const amounts = calculateFormulationComponentAmounts({
		totalAmount: input.mixAmount,
		batchSize: input.batchSize,
		components: input.components,
	});
	return input.components.map((component, index) => {
		const amount = amounts[index];
		return {
			id: component.applicationId,
			insecticide_id: amount?.insecticideId ?? component.insecticideId,
			amount_applied: amount?.amount ?? 0,
			application_unit_id: amount?.unitId ?? component.unitId,
			application_batches: component.applicationBatches ?? [],
		};
	});
}

/**
 * One `recordTreatment` mixed from a Formulation: the reference, the mix amount,
 * and one line per component computed from the recipe.
 */
export function recordTreatmentFromFormulationCommand(
	input: RecordTreatmentFromFormulationCommandInput,
): RecordTreatmentCommand {
	const { batchSize, components, ...header } = input;
	return recordTreatmentCommand({
		...header,
		applications: formulationTreatmentApplications({
			mixAmount: input.mixAmount,
			batchSize,
			components,
		}),
	});
}

export function updateTreatmentFieldDetailsCommand(
	input: UpdateTreatmentFieldDetailsCommandInput,
): UpdateTreatmentFieldDetailsCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.treatmentId, 'treatmentId', issues);
	const fields = normalizeUpdateFields(input, TREATMENT_UPDATE_FIELDS, null, issues);
	const formulation = normalizeTreatmentFormulationChange(input, issues);
	const namesFormulation =
		input.formulationId !== undefined ||
		input.mixAmount !== undefined ||
		input.mixUnitId !== undefined;
	if (Object.keys(fields).length === 0 && !namesFormulation) {
		issues.push({ path: 'changes', message: 'At least one treatment field must change.' });
	}
	throwIfIssues('Update treatment field details command is invalid.', issues);
	return {
		type: 'controlOperations.updateTreatmentFieldDetails',
		payload: {
			...basePayload(input),
			treatmentId: normalizeRequiredId(input.treatmentId),
			changes: { ...fields, ...formulation },
		},
	};
}

export function updateTreatmentLocationAndContextCommand(
	input: UpdateTreatmentLocationAndContextCommandInput,
): UpdateTreatmentLocationAndContextCommand {
	const issues = validateLocationContextPatchBase(input, 'treatmentId', 'controlAction');
	const context = input.context
		? validateControlActionContext(input.context, 'chemicalApplication', issues)
		: undefined;
	throwIfIssues('Update treatment location and context command is invalid.', issues);
	return {
		type: 'controlOperations.updateTreatmentLocationAndContext',
		payload: {
			...basePayload(input),
			treatmentId: normalizeRequiredId(input.treatmentId),
			changes: locationContextChanges(input, context, issues, 'controlAction'),
		},
	};
}

export function reviseTreatmentLinesCommand(
	input: ReviseTreatmentLinesCommandInput,
): ReviseTreatmentLinesCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.treatmentId, 'treatmentId', issues);
	const applications = normalizeTreatmentApplications(input.applications, issues);
	throwIfIssues('Revise treatment lines command is invalid.', issues);
	return {
		type: 'controlOperations.reviseTreatmentLines',
		payload: {
			...basePayload(input),
			treatmentId: normalizeRequiredId(input.treatmentId),
			applications,
		},
	};
}

export function deleteTreatmentCommand(input: DeleteTreatmentCommandInput): DeleteTreatmentCommand {
	const issues = validateIdCommand(input, 'treatmentId');
	throwIfIssues('Delete treatment command is invalid.', issues);
	return {
		type: 'controlOperations.deleteTreatment',
		payload: {
			...basePayload(input),
			treatmentId: normalizeRequiredId(input.treatmentId),
			acknowledgedSupportRecordDeletion: input.acknowledgedSupportRecordDeletion ?? false,
			acknowledgedBatchDeletion: input.acknowledgedBatchDeletion ?? false,
		},
	};
}
