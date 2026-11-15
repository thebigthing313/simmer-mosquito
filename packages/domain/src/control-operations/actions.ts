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
import type { UnitType } from '../organization-settings/index.js';
import {
	type ControlActionContext,
	normalizeBiocontrolFields,
	normalizeOutreachFields,
	normalizeSourceReductionFields,
	validateControlActionContext,
} from '../performed-control-actions.js';
import type { DomainId, DomainValidationIssue, JsonObject, LocalDateString } from '../shared.js';
import {
	jsonObjectField,
	localDateField,
	nullableReferenceIdField,
	nullableTextField,
	referenceIdField,
	type UpdateFieldSet,
	type UpdateFieldsChanges,
	type UpdateFieldsInput,
	updateFieldsCommand,
} from '../update-command-fields.js';
import type {
	ControlCommandInput,
	ControlCommandPayload,
	ControlOperationsDomainCommand,
} from './core.js';
import {
	BIOCONTROL_UNIT_TYPES,
	locationContextChanges,
	normalizePositiveFiniteNumber,
	normalizePositiveInteger,
	SOURCE_REDUCTION_UNIT_TYPES,
	validateLocationContextPatchBase,
} from './core.js';
export interface ActionBaseInput extends ControlCommandInput {
	readonly locationSource: ControlActionLocationSourceInput;
	readonly addressId?: DomainId | null;
	readonly requestedControlActionId?: DomainId | null;
	readonly metadata?: unknown | null;
}

export interface ActionBasePayload extends ControlCommandPayload {
	readonly locationSource: ControlActionLocationSource;
	readonly addressId: DomainId | null;
	readonly requestedControlActionId: DomainId | null;
	readonly metadata: JsonObject | null;
}

export interface RecordSourceReductionCommandInput extends ActionBaseInput {
	readonly sourceReductionId: DomainId;
	readonly sourceReductionMethodId: DomainId;
	readonly technicianProfileId?: DomainId | null;
	readonly sourceReductionDate: LocalDateString;
	readonly context?: ControlActionContext;
	readonly sourcesEliminatedAmount: number;
	readonly sourcesEliminatedUnitId: DomainId;
}

export type RecordSourceReductionCommand = ControlOperationsDomainCommand<
	'controlOperations.recordSourceReduction',
	ActionBasePayload & {
		readonly sourceReductionId: DomainId;
		readonly sourceReductionMethodId: DomainId;
		readonly technicianProfileId: DomainId;
		readonly sourceReductionDate: LocalDateString;
		readonly context: ControlActionContext;
		readonly sourcesEliminatedAmount: number;
		readonly sourcesEliminatedUnitId: DomainId;
	}
>;

export const SOURCE_REDUCTION_UPDATE_FIELDS = {
	sourceReductionDate: localDateField,
	technicianProfileId: nullableReferenceIdField,
	sourceReductionMethodId: referenceIdField,
	sourcesEliminatedAmount: normalizePositiveFiniteNumber,
	sourcesEliminatedUnitId: referenceIdField,
	metadata: jsonObjectField,
} satisfies UpdateFieldSet;

export type UpdateSourceReductionFieldDetailsCommandInput = ControlCommandInput &
	UpdateFieldsInput<typeof SOURCE_REDUCTION_UPDATE_FIELDS> & {
		readonly sourceReductionId: DomainId;
	};

export type UpdateSourceReductionFieldDetailsCommand = ControlOperationsDomainCommand<
	'controlOperations.updateSourceReductionFieldDetails',
	ControlCommandPayload & {
		readonly sourceReductionId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof SOURCE_REDUCTION_UPDATE_FIELDS>;
	}
>;

export interface UpdateSourceReductionLocationAndContextCommandInput extends ControlCommandInput {
	readonly sourceReductionId: DomainId;
	readonly locationSource?: ControlActionLocationSourceInput;
	readonly addressId?: DomainId | null;
	readonly context?: ControlActionContext;
	readonly requestedControlActionId?: DomainId | null;
}

export type UpdateSourceReductionLocationAndContextCommand = ControlOperationsDomainCommand<
	'controlOperations.updateSourceReductionLocationAndContext',
	ControlCommandPayload & {
		readonly sourceReductionId: DomainId;
		readonly changes: Readonly<{
			readonly locationSource?: ControlActionLocationSource;
			readonly addressId?: DomainId | null;
			readonly context?: ControlActionContext;
			readonly requestedControlActionId?: DomainId | null;
		}>;
	}
>;

export interface DeleteSourceReductionCommandInput extends ControlCommandInput {
	readonly sourceReductionId: DomainId;
	readonly acknowledgedSupportRecordDeletion?: boolean;
}

export type DeleteSourceReductionCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteSourceReduction',
	ControlCommandPayload & {
		readonly sourceReductionId: DomainId;
		readonly acknowledgedSupportRecordDeletion: boolean;
	}
>;

export interface RecordOutreachActionCommandInput extends ActionBaseInput {
	readonly outreachActionId: DomainId;
	readonly outreachMethodId: DomainId;
	readonly technicianProfileId?: DomainId | null;
	readonly outreachDate: LocalDateString;
	readonly context?: ControlActionContext;
	readonly reach: number;
	readonly reachDescription?: string | null;
}

export type RecordOutreachActionCommand = ControlOperationsDomainCommand<
	'controlOperations.recordOutreachAction',
	ActionBasePayload & {
		readonly outreachActionId: DomainId;
		readonly outreachMethodId: DomainId;
		readonly technicianProfileId: DomainId;
		readonly outreachDate: LocalDateString;
		readonly context: ControlActionContext;
		readonly reach: number;
		readonly reachDescription: string | null;
	}
>;

export const OUTREACH_ACTION_UPDATE_FIELDS = {
	outreachDate: localDateField,
	technicianProfileId: nullableReferenceIdField,
	outreachMethodId: referenceIdField,
	reach: normalizePositiveInteger,
	reachDescription: nullableTextField(2_000),
	metadata: jsonObjectField,
} satisfies UpdateFieldSet;

export type UpdateOutreachActionFieldDetailsCommandInput = ControlCommandInput &
	UpdateFieldsInput<typeof OUTREACH_ACTION_UPDATE_FIELDS> & {
		readonly outreachActionId: DomainId;
	};

export type UpdateOutreachActionFieldDetailsCommand = ControlOperationsDomainCommand<
	'controlOperations.updateOutreachActionFieldDetails',
	ControlCommandPayload & {
		readonly outreachActionId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof OUTREACH_ACTION_UPDATE_FIELDS>;
	}
>;

export interface UpdateOutreachActionLocationAndContextCommandInput extends ControlCommandInput {
	readonly outreachActionId: DomainId;
	readonly locationSource?: ControlActionLocationSourceInput;
	readonly addressId?: DomainId | null;
	readonly context?: ControlActionContext;
	readonly requestedControlActionId?: DomainId | null;
}

export type UpdateOutreachActionLocationAndContextCommand = ControlOperationsDomainCommand<
	'controlOperations.updateOutreachActionLocationAndContext',
	ControlCommandPayload & {
		readonly outreachActionId: DomainId;
		readonly changes: Readonly<{
			readonly locationSource?: ControlActionLocationSource;
			readonly addressId?: DomainId | null;
			readonly context?: ControlActionContext;
			readonly requestedControlActionId?: DomainId | null;
		}>;
	}
>;

export interface DeleteOutreachActionCommandInput extends ControlCommandInput {
	readonly outreachActionId: DomainId;
	readonly acknowledgedSupportRecordDeletion?: boolean;
}

export type DeleteOutreachActionCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteOutreachAction',
	ControlCommandPayload & {
		readonly outreachActionId: DomainId;
		readonly acknowledgedSupportRecordDeletion: boolean;
	}
>;

export interface RecordBiocontrolActionCommandInput extends ActionBaseInput {
	readonly biocontrolActionId: DomainId;
	readonly biocontrolMethodId: DomainId;
	readonly technicianProfileId?: DomainId | null;
	readonly biocontrolDate: LocalDateString;
	readonly context?: ControlActionContext;
	readonly amountReleased: number;
	readonly releaseUnitId: DomainId;
}

export type RecordBiocontrolActionCommand = ControlOperationsDomainCommand<
	'controlOperations.recordBiocontrolAction',
	ActionBasePayload & {
		readonly biocontrolActionId: DomainId;
		readonly biocontrolMethodId: DomainId;
		readonly technicianProfileId: DomainId;
		readonly biocontrolDate: LocalDateString;
		readonly context: ControlActionContext;
		readonly amountReleased: number;
		readonly releaseUnitId: DomainId;
	}
>;

export const BIOCONTROL_ACTION_UPDATE_FIELDS = {
	biocontrolDate: localDateField,
	technicianProfileId: nullableReferenceIdField,
	biocontrolMethodId: referenceIdField,
	amountReleased: normalizePositiveFiniteNumber,
	releaseUnitId: referenceIdField,
	metadata: jsonObjectField,
} satisfies UpdateFieldSet;

export type UpdateBiocontrolActionFieldDetailsCommandInput = ControlCommandInput &
	UpdateFieldsInput<typeof BIOCONTROL_ACTION_UPDATE_FIELDS> & {
		readonly biocontrolActionId: DomainId;
	};

export type UpdateBiocontrolActionFieldDetailsCommand = ControlOperationsDomainCommand<
	'controlOperations.updateBiocontrolActionFieldDetails',
	ControlCommandPayload & {
		readonly biocontrolActionId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof BIOCONTROL_ACTION_UPDATE_FIELDS>;
	}
>;

export interface UpdateBiocontrolActionLocationAndContextCommandInput extends ControlCommandInput {
	readonly biocontrolActionId: DomainId;
	readonly locationSource?: ControlActionLocationSourceInput;
	readonly addressId?: DomainId | null;
	readonly context?: ControlActionContext;
	readonly requestedControlActionId?: DomainId | null;
}

export type UpdateBiocontrolActionLocationAndContextCommand = ControlOperationsDomainCommand<
	'controlOperations.updateBiocontrolActionLocationAndContext',
	ControlCommandPayload & {
		readonly biocontrolActionId: DomainId;
		readonly changes: Readonly<{
			readonly locationSource?: ControlActionLocationSource;
			readonly addressId?: DomainId | null;
			readonly context?: ControlActionContext;
			readonly requestedControlActionId?: DomainId | null;
		}>;
	}
>;

export interface DeleteBiocontrolActionCommandInput extends ControlCommandInput {
	readonly biocontrolActionId: DomainId;
	readonly acknowledgedSupportRecordDeletion?: boolean;
}

export type DeleteBiocontrolActionCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteBiocontrolAction',
	ControlCommandPayload & {
		readonly biocontrolActionId: DomainId;
		readonly acknowledgedSupportRecordDeletion: boolean;
	}
>;

export function recordSourceReductionCommand(
	input: RecordSourceReductionCommandInput,
): RecordSourceReductionCommand {
	const issues = createIssues();
	validateActionBase(input, issues);
	requireUuid(input.sourceReductionId, 'sourceReductionId', issues);
	requireUuid(input.sourceReductionMethodId, 'sourceReductionMethodId', issues);
	const context = validateControlActionContext(
		input.context ?? { kind: 'none' },
		'sourceReduction',
		issues,
	);
	const metadata = normalizeMetadata(input.metadata, 'metadata', issues);
	const fields = normalizeSourceReductionFields(input, issues);
	throwIfIssues('Record source reduction command is invalid.', issues);
	return {
		type: 'controlOperations.recordSourceReduction',
		payload: {
			...actionBasePayload(input, metadata, issues),
			sourceReductionId: normalizeRequiredId(input.sourceReductionId),
			sourceReductionMethodId: normalizeRequiredId(input.sourceReductionMethodId),
			technicianProfileId: fields.technicianProfileId,
			sourceReductionDate: fields.sourceReductionDate,
			context,
			sourcesEliminatedAmount: fields.sourcesEliminatedAmount,
			sourcesEliminatedUnitId: fields.sourcesEliminatedUnitId,
		},
	};
}

export function updateSourceReductionFieldDetailsCommand(
	input: UpdateSourceReductionFieldDetailsCommandInput,
): UpdateSourceReductionFieldDetailsCommand {
	return updateFieldsCommand({
		type: 'controlOperations.updateSourceReductionFieldDetails',
		input,
		idKey: 'sourceReductionId',
		fields: SOURCE_REDUCTION_UPDATE_FIELDS,
		changeNoun: 'source reduction',
		message: 'Update source reduction field details command is invalid.',
	});
}

export function updateSourceReductionLocationAndContextCommand(
	input: UpdateSourceReductionLocationAndContextCommandInput,
): UpdateSourceReductionLocationAndContextCommand {
	const issues = validateLocationContextPatchBase(input, 'sourceReductionId', 'controlAction');
	const context = input.context
		? validateControlActionContext(input.context, 'sourceReduction', issues)
		: undefined;
	throwIfIssues('Update source reduction location and context command is invalid.', issues);
	return {
		type: 'controlOperations.updateSourceReductionLocationAndContext',
		payload: {
			...basePayload(input),
			sourceReductionId: normalizeRequiredId(input.sourceReductionId),
			changes: locationContextChanges(input, context, issues, 'controlAction'),
		},
	};
}

export function deleteSourceReductionCommand(
	input: DeleteSourceReductionCommandInput,
): DeleteSourceReductionCommand {
	const issues = validateIdCommand(input, 'sourceReductionId');
	throwIfIssues('Delete source reduction command is invalid.', issues);
	return {
		type: 'controlOperations.deleteSourceReduction',
		payload: {
			...basePayload(input),
			sourceReductionId: normalizeRequiredId(input.sourceReductionId),
			acknowledgedSupportRecordDeletion: input.acknowledgedSupportRecordDeletion ?? false,
		},
	};
}

export function recordOutreachActionCommand(
	input: RecordOutreachActionCommandInput,
): RecordOutreachActionCommand {
	const issues = createIssues();
	validateActionBase(input, issues);
	requireUuid(input.outreachActionId, 'outreachActionId', issues);
	requireUuid(input.outreachMethodId, 'outreachMethodId', issues);
	const context = validateControlActionContext(
		input.context ?? { kind: 'none' },
		'outreach',
		issues,
	);
	const metadata = normalizeMetadata(input.metadata, 'metadata', issues);
	const fields = normalizeOutreachFields(input, issues);
	throwIfIssues('Record outreach action command is invalid.', issues);
	return {
		type: 'controlOperations.recordOutreachAction',
		payload: {
			...actionBasePayload(input, metadata, issues),
			outreachActionId: normalizeRequiredId(input.outreachActionId),
			outreachMethodId: normalizeRequiredId(input.outreachMethodId),
			technicianProfileId: fields.technicianProfileId,
			outreachDate: fields.outreachDate,
			context,
			reach: fields.reach,
			reachDescription: fields.reachDescription,
		},
	};
}

export function updateOutreachActionFieldDetailsCommand(
	input: UpdateOutreachActionFieldDetailsCommandInput,
): UpdateOutreachActionFieldDetailsCommand {
	return updateFieldsCommand({
		type: 'controlOperations.updateOutreachActionFieldDetails',
		input,
		idKey: 'outreachActionId',
		fields: OUTREACH_ACTION_UPDATE_FIELDS,
		changeNoun: 'outreach action',
		message: 'Update outreach action field details command is invalid.',
	});
}

export function updateOutreachActionLocationAndContextCommand(
	input: UpdateOutreachActionLocationAndContextCommandInput,
): UpdateOutreachActionLocationAndContextCommand {
	const issues = validateLocationContextPatchBase(input, 'outreachActionId', 'controlAction');
	const context = input.context
		? validateControlActionContext(input.context, 'outreach', issues)
		: undefined;
	throwIfIssues('Update outreach action location and context command is invalid.', issues);
	return {
		type: 'controlOperations.updateOutreachActionLocationAndContext',
		payload: {
			...basePayload(input),
			outreachActionId: normalizeRequiredId(input.outreachActionId),
			changes: locationContextChanges(input, context, issues, 'controlAction'),
		},
	};
}

export function deleteOutreachActionCommand(
	input: DeleteOutreachActionCommandInput,
): DeleteOutreachActionCommand {
	const issues = validateIdCommand(input, 'outreachActionId');
	throwIfIssues('Delete outreach action command is invalid.', issues);
	return {
		type: 'controlOperations.deleteOutreachAction',
		payload: {
			...basePayload(input),
			outreachActionId: normalizeRequiredId(input.outreachActionId),
			acknowledgedSupportRecordDeletion: input.acknowledgedSupportRecordDeletion ?? false,
		},
	};
}

export function recordBiocontrolActionCommand(
	input: RecordBiocontrolActionCommandInput,
): RecordBiocontrolActionCommand {
	const issues = createIssues();
	validateActionBase(input, issues);
	requireUuid(input.biocontrolActionId, 'biocontrolActionId', issues);
	requireUuid(input.biocontrolMethodId, 'biocontrolMethodId', issues);
	const context = validateControlActionContext(
		input.context ?? { kind: 'none' },
		'biocontrol',
		issues,
	);
	const metadata = normalizeMetadata(input.metadata, 'metadata', issues);
	const fields = normalizeBiocontrolFields(input, issues);
	throwIfIssues('Record biocontrol action command is invalid.', issues);
	return {
		type: 'controlOperations.recordBiocontrolAction',
		payload: {
			...actionBasePayload(input, metadata, issues),
			biocontrolActionId: normalizeRequiredId(input.biocontrolActionId),
			biocontrolMethodId: normalizeRequiredId(input.biocontrolMethodId),
			technicianProfileId: fields.technicianProfileId,
			biocontrolDate: fields.biocontrolDate,
			context,
			amountReleased: fields.amountReleased,
			releaseUnitId: fields.releaseUnitId,
		},
	};
}

export function updateBiocontrolActionFieldDetailsCommand(
	input: UpdateBiocontrolActionFieldDetailsCommandInput,
): UpdateBiocontrolActionFieldDetailsCommand {
	return updateFieldsCommand({
		type: 'controlOperations.updateBiocontrolActionFieldDetails',
		input,
		idKey: 'biocontrolActionId',
		fields: BIOCONTROL_ACTION_UPDATE_FIELDS,
		changeNoun: 'biocontrol action',
		message: 'Update biocontrol action field details command is invalid.',
	});
}

export function updateBiocontrolActionLocationAndContextCommand(
	input: UpdateBiocontrolActionLocationAndContextCommandInput,
): UpdateBiocontrolActionLocationAndContextCommand {
	const issues = validateLocationContextPatchBase(input, 'biocontrolActionId', 'controlAction');
	const context = input.context
		? validateControlActionContext(input.context, 'biocontrol', issues)
		: undefined;
	throwIfIssues('Update biocontrol action location and context command is invalid.', issues);
	return {
		type: 'controlOperations.updateBiocontrolActionLocationAndContext',
		payload: {
			...basePayload(input),
			biocontrolActionId: normalizeRequiredId(input.biocontrolActionId),
			changes: locationContextChanges(input, context, issues, 'controlAction'),
		},
	};
}

export function deleteBiocontrolActionCommand(
	input: DeleteBiocontrolActionCommandInput,
): DeleteBiocontrolActionCommand {
	const issues = validateIdCommand(input, 'biocontrolActionId');
	throwIfIssues('Delete biocontrol action command is invalid.', issues);
	return {
		type: 'controlOperations.deleteBiocontrolAction',
		payload: {
			...basePayload(input),
			biocontrolActionId: normalizeRequiredId(input.biocontrolActionId),
			acknowledgedSupportRecordDeletion: input.acknowledgedSupportRecordDeletion ?? false,
		},
	};
}

export function isSourceReductionUnitType(unitType: UnitType): boolean {
	return SOURCE_REDUCTION_UNIT_TYPES.includes(
		unitType as (typeof SOURCE_REDUCTION_UNIT_TYPES)[number],
	);
}

export function isBiocontrolUnitType(unitType: UnitType): boolean {
	return BIOCONTROL_UNIT_TYPES.includes(unitType as (typeof BIOCONTROL_UNIT_TYPES)[number]);
}

function validateActionBase(input: ActionBaseInput, issues: DomainValidationIssue[]): void {
	validateBase(input, issues);
	validateLocationSourceInput(input, 'controlAction', issues);
	normalizeOptionalUuid(input.addressId, 'addressId', issues);
	normalizeOptionalUuid(input.requestedControlActionId, 'requestedControlActionId', issues);
	normalizeMetadata(input.metadata, 'metadata', issues);
}

function actionBasePayload(
	input: ActionBaseInput,
	metadata: JsonObject | null,
	issues: DomainValidationIssue[],
): ActionBasePayload {
	return {
		...basePayload(input),
		locationSource: validateLocationSourceInput(input, 'controlAction', issues),
		addressId: normalizeOptionalUuid(input.addressId, 'addressId', issues),
		requestedControlActionId: normalizeOptionalUuid(
			input.requestedControlActionId,
			'requestedControlActionId',
			issues,
		),
		metadata,
	};
}
