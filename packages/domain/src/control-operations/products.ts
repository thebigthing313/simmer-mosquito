import {
	createIssues,
	jsonObject as normalizeMetadata,
	nullableText as normalizeNullableText,
	requiredId as normalizeRequiredId,
	requiredText as normalizeRequiredText,
	requiredUuid as requireUuid,
	throwIfIssues,
} from '../command-validation.js';
import type { ControlActionLocationSourceInput } from '../location-intent.js';
import type { ApplicationBatchInput, ControlActionContext } from '../performed-control-actions.js';
import type { DomainId, JsonObject, LocalDateString } from '../shared.js';
import type {
	RecordChemicalApplicationCommand,
	RecordChemicalApplicationCommandInput,
} from './actions.js';
import { recordChemicalApplicationCommand } from './actions.js';
import type {
	ControlCommandInput,
	ControlCommandPayload,
	ControlOperationsDomainCommand,
	InsecticideType,
} from './core.js';
import {
	basePayload,
	INSECTICIDE_TYPES,
	idCommand,
	normalizeNullableUrl,
	normalizePositiveFiniteNumber,
	normalizeStringUnion,
	validateBase,
	validateIdCommand,
} from './core.js';
export interface CreateInsecticideCommandInput extends ControlCommandInput {
	readonly insecticideId: DomainId;
	readonly tradeName: string;
	readonly activeIngredient: string;
	readonly type: InsecticideType;
	readonly registrationNumber: string;
	readonly defaultUnitId: DomainId;
	readonly labelUrl?: string | null;
	readonly msdsUrl?: string | null;
	readonly shorthand?: string | null;
	readonly metadata?: unknown | null;
}

export type CreateInsecticideCommand = ControlOperationsDomainCommand<
	'controlOperations.createInsecticide',
	ControlCommandPayload & {
		readonly insecticideId: DomainId;
		readonly tradeName: string;
		readonly activeIngredient: string;
		readonly type: InsecticideType;
		readonly registrationNumber: string;
		readonly defaultUnitId: DomainId;
		readonly labelUrl: string | null;
		readonly msdsUrl: string | null;
		readonly shorthand: string | null;
		readonly metadata: JsonObject | null;
	}
>;

export interface UpdateInsecticideCommandInput extends ControlCommandInput {
	readonly insecticideId: DomainId;
	readonly tradeName?: string;
	readonly activeIngredient?: string;
	readonly type?: InsecticideType;
	readonly registrationNumber?: string;
	readonly defaultUnitId?: DomainId;
	readonly labelUrl?: string | null;
	readonly msdsUrl?: string | null;
	readonly shorthand?: string | null;
	readonly metadata?: unknown | null;
	readonly acknowledgedHistoricalProductChange?: boolean;
}

export type UpdateInsecticideCommand = ControlOperationsDomainCommand<
	'controlOperations.updateInsecticide',
	ControlCommandPayload & {
		readonly insecticideId: DomainId;
		readonly changes: Readonly<{
			readonly tradeName?: string;
			readonly activeIngredient?: string;
			readonly type?: InsecticideType;
			readonly registrationNumber?: string;
			readonly defaultUnitId?: DomainId;
			readonly labelUrl?: string | null;
			readonly msdsUrl?: string | null;
			readonly shorthand?: string | null;
			readonly metadata?: JsonObject | null;
		}>;
		readonly acknowledgedHistoricalProductChange: boolean;
	}
>;

export interface InsecticideIdCommandInput extends ControlCommandInput {
	readonly insecticideId: DomainId;
}

export interface DeactivateInsecticideCommandInput extends InsecticideIdCommandInput {
	readonly acknowledgedDependentDeactivation?: boolean;
}

export type DeactivateInsecticideCommand = ControlOperationsDomainCommand<
	'controlOperations.deactivateInsecticide',
	ControlCommandPayload & {
		readonly insecticideId: DomainId;
		readonly acknowledgedDependentDeactivation: boolean;
	}
>;

export type ReactivateInsecticideCommand = ControlOperationsDomainCommand<
	'controlOperations.reactivateInsecticide',
	ControlCommandPayload & { readonly insecticideId: DomainId }
>;

export type DeleteInsecticideCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteInsecticide',
	ControlCommandPayload & { readonly insecticideId: DomainId }
>;

export interface CreateInsecticideBatchCommandInput extends ControlCommandInput {
	readonly insecticideBatchId: DomainId;
	readonly insecticideId: DomainId;
	readonly batchName: string;
}

export type CreateInsecticideBatchCommand = ControlOperationsDomainCommand<
	'controlOperations.createInsecticideBatch',
	ControlCommandPayload & {
		readonly insecticideBatchId: DomainId;
		readonly insecticideId: DomainId;
		readonly batchName: string;
	}
>;

export interface UpdateInsecticideBatchCommandInput extends ControlCommandInput {
	readonly insecticideBatchId: DomainId;
	readonly batchName?: string;
	readonly acknowledgedHistoricalBatchLabelChange?: boolean;
}

export type UpdateInsecticideBatchCommand = ControlOperationsDomainCommand<
	'controlOperations.updateInsecticideBatch',
	ControlCommandPayload & {
		readonly insecticideBatchId: DomainId;
		readonly changes: Readonly<{ readonly batchName?: string }>;
		readonly acknowledgedHistoricalBatchLabelChange: boolean;
	}
>;

export interface InsecticideBatchIdCommandInput extends ControlCommandInput {
	readonly insecticideBatchId: DomainId;
}

export type DeactivateInsecticideBatchCommand = ControlOperationsDomainCommand<
	'controlOperations.deactivateInsecticideBatch',
	ControlCommandPayload & { readonly insecticideBatchId: DomainId }
>;

export type ReactivateInsecticideBatchCommand = ControlOperationsDomainCommand<
	'controlOperations.reactivateInsecticideBatch',
	ControlCommandPayload & { readonly insecticideBatchId: DomainId }
>;

export type DeleteInsecticideBatchCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteInsecticideBatch',
	ControlCommandPayload & { readonly insecticideBatchId: DomainId }
>;

export interface CreateFormulationCommandInput extends ControlCommandInput {
	readonly formulationId: DomainId;
	readonly formulationName: string;
	readonly description?: string | null;
	/** What one batch of the mix makes, in `batchUnitId` — 26 gallons of spray. */
	readonly batchSize: number;
	readonly batchUnitId: DomainId;
}

export type CreateFormulationCommand = ControlOperationsDomainCommand<
	'controlOperations.createFormulation',
	ControlCommandPayload & {
		readonly formulationId: DomainId;
		readonly formulationName: string;
		readonly description: string | null;
		readonly batchSize: number;
		readonly batchUnitId: DomainId;
	}
>;

export interface UpdateFormulationDetailsCommandInput extends ControlCommandInput {
	readonly formulationId: DomainId;
	readonly formulationName?: string;
	readonly description?: string | null;
	readonly batchSize?: number;
	readonly batchUnitId?: DomainId;
}

export type UpdateFormulationDetailsCommand = ControlOperationsDomainCommand<
	'controlOperations.updateFormulationDetails',
	ControlCommandPayload & {
		readonly formulationId: DomainId;
		readonly changes: Readonly<{
			readonly formulationName?: string;
			readonly description?: string | null;
			readonly batchSize?: number;
			readonly batchUnitId?: DomainId;
		}>;
	}
>;

export interface FormulationIdCommandInput extends ControlCommandInput {
	readonly formulationId: DomainId;
}

export type ActivateFormulationCommand = ControlOperationsDomainCommand<
	'controlOperations.activateFormulation',
	ControlCommandPayload & { readonly formulationId: DomainId }
>;

export type DeactivateFormulationCommand = ControlOperationsDomainCommand<
	'controlOperations.deactivateFormulation',
	ControlCommandPayload & { readonly formulationId: DomainId }
>;

export interface DeleteFormulationCommandInput extends FormulationIdCommandInput {
	readonly acknowledgedComponentDeletion?: boolean;
}

export type DeleteFormulationCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteFormulation',
	ControlCommandPayload & {
		readonly formulationId: DomainId;
		readonly acknowledgedComponentDeletion: boolean;
	}
>;

export interface AddFormulationInsecticideCommandInput extends ControlCommandInput {
	readonly formulationInsecticideId: DomainId;
	readonly formulationId: DomainId;
	readonly insecticideId: DomainId;
	/** How much of this product one batch takes, in `unitId` — 0.5 pounds. */
	readonly amount: number;
	readonly unitId: DomainId;
}

export type AddFormulationInsecticideCommand = ControlOperationsDomainCommand<
	'controlOperations.addFormulationInsecticide',
	ControlCommandPayload & {
		readonly formulationInsecticideId: DomainId;
		readonly formulationId: DomainId;
		readonly insecticideId: DomainId;
		readonly amount: number;
		readonly unitId: DomainId;
	}
>;

export interface UpdateFormulationInsecticideCommandInput extends ControlCommandInput {
	readonly formulationInsecticideId: DomainId;
	readonly insecticideId?: DomainId;
	readonly amount?: number;
	readonly unitId?: DomainId;
	readonly acknowledgedDeactivateEmptyFormulation?: boolean;
}

export type UpdateFormulationInsecticideCommand = ControlOperationsDomainCommand<
	'controlOperations.updateFormulationInsecticide',
	ControlCommandPayload & {
		readonly formulationInsecticideId: DomainId;
		readonly changes: Readonly<{
			readonly insecticideId?: DomainId;
			readonly amount?: number;
			readonly unitId?: DomainId;
		}>;
		readonly acknowledgedDeactivateEmptyFormulation: boolean;
	}
>;

export interface RemoveFormulationInsecticideCommandInput extends ControlCommandInput {
	readonly formulationInsecticideId: DomainId;
	readonly acknowledgedDeactivateEmptyFormulation?: boolean;
}

export type RemoveFormulationInsecticideCommand = ControlOperationsDomainCommand<
	'controlOperations.removeFormulationInsecticide',
	ControlCommandPayload & {
		readonly formulationInsecticideId: DomainId;
		readonly acknowledgedDeactivateEmptyFormulation: boolean;
	}
>;

export interface FormulationComponentAmountInput {
	readonly insecticideId: DomainId;
	/** Per batch of the mix. */
	readonly amount: number;
	readonly unitId: DomainId;
}

export interface CalculateFormulationComponentAmountsInput {
	/** How much mix went out, in the formulation's batch unit. */
	readonly totalAmount: number;
	readonly batchSize: number;
	readonly components: readonly FormulationComponentAmountInput[];
}

export interface FormulationComponentAmount {
	readonly insecticideId: DomainId;
	/** The scaled amount, in `unitId` — the product's own unit, not the batch's. */
	readonly amount: number;
	readonly unitId: DomainId;
}

export interface FormulationExpansionComponentInput extends FormulationComponentAmountInput {
	readonly applicationId: DomainId;
	readonly applicationBatches?: readonly ApplicationBatchInput[];
}

export interface ExpandFormulationApplicationCommandsInput extends ControlCommandInput {
	readonly totalAmount: number;
	readonly batchSize: number;
	readonly components: readonly FormulationExpansionComponentInput[];
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
}

export function createInsecticideCommand(
	input: CreateInsecticideCommandInput,
): CreateInsecticideCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.insecticideId, 'insecticideId', issues);
	requireUuid(input.defaultUnitId, 'defaultUnitId', issues);
	const type = normalizeStringUnion(input.type, INSECTICIDE_TYPES, 'type', issues);
	const tradeName = normalizeRequiredText(input.tradeName, 'tradeName', issues, 200);
	const activeIngredient = normalizeRequiredText(
		input.activeIngredient,
		'activeIngredient',
		issues,
		500,
	);
	const registrationNumber = normalizeRequiredText(
		input.registrationNumber,
		'registrationNumber',
		issues,
		500,
	);
	const labelUrl = normalizeNullableUrl(input.labelUrl, 'labelUrl', issues);
	const msdsUrl = normalizeNullableUrl(input.msdsUrl, 'msdsUrl', issues);
	const shorthand = normalizeNullableText(input.shorthand, 'shorthand', issues, 200);
	const metadata = normalizeMetadata(input.metadata, 'metadata', issues);
	throwIfIssues('Create insecticide command is invalid.', issues);
	return {
		type: 'controlOperations.createInsecticide',
		payload: {
			...basePayload(input),
			insecticideId: normalizeRequiredId(input.insecticideId),
			tradeName,
			activeIngredient,
			type,
			registrationNumber,
			defaultUnitId: normalizeRequiredId(input.defaultUnitId),
			labelUrl,
			msdsUrl,
			shorthand,
			metadata,
		},
	};
}

export function updateInsecticideCommand(
	input: UpdateInsecticideCommandInput,
): UpdateInsecticideCommand {
	const issues = validateIdCommand(input, 'insecticideId');
	const hasTradeName = input.tradeName !== undefined;
	const hasActiveIngredient = input.activeIngredient !== undefined;
	const hasType = input.type !== undefined;
	const hasRegistrationNumber = input.registrationNumber !== undefined;
	const hasDefaultUnit = input.defaultUnitId !== undefined;
	const hasLabelUrl = input.labelUrl !== undefined;
	const hasMsdsUrl = input.msdsUrl !== undefined;
	const hasShorthand = input.shorthand !== undefined;
	const hasMetadata = input.metadata !== undefined;
	if (
		!hasTradeName &&
		!hasActiveIngredient &&
		!hasType &&
		!hasRegistrationNumber &&
		!hasDefaultUnit &&
		!hasLabelUrl &&
		!hasMsdsUrl &&
		!hasShorthand &&
		!hasMetadata
	) {
		issues.push({ path: 'changes', message: 'At least one insecticide field must change.' });
	}
	if (hasDefaultUnit) {
		requireUuid(input.defaultUnitId, 'defaultUnitId', issues);
	}
	const type = hasType
		? normalizeStringUnion(input.type, INSECTICIDE_TYPES, 'type', issues)
		: undefined;
	const tradeName = hasTradeName
		? normalizeRequiredText(input.tradeName, 'tradeName', issues, 200)
		: undefined;
	const activeIngredient = hasActiveIngredient
		? normalizeRequiredText(input.activeIngredient, 'activeIngredient', issues, 500)
		: undefined;
	const registrationNumber = hasRegistrationNumber
		? normalizeRequiredText(input.registrationNumber, 'registrationNumber', issues, 500)
		: undefined;
	const labelUrl = hasLabelUrl
		? normalizeNullableUrl(input.labelUrl, 'labelUrl', issues)
		: undefined;
	const msdsUrl = hasMsdsUrl ? normalizeNullableUrl(input.msdsUrl, 'msdsUrl', issues) : undefined;
	const shorthand = hasShorthand
		? normalizeNullableText(input.shorthand, 'shorthand', issues, 200)
		: undefined;
	const metadata = hasMetadata ? normalizeMetadata(input.metadata, 'metadata', issues) : undefined;
	throwIfIssues('Update insecticide command is invalid.', issues);
	return {
		type: 'controlOperations.updateInsecticide',
		payload: {
			...basePayload(input),
			insecticideId: normalizeRequiredId(input.insecticideId),
			changes: {
				...(tradeName !== undefined ? { tradeName } : {}),
				...(activeIngredient !== undefined ? { activeIngredient } : {}),
				...(type !== undefined ? { type } : {}),
				...(registrationNumber !== undefined ? { registrationNumber } : {}),
				...(hasDefaultUnit ? { defaultUnitId: normalizeRequiredId(input.defaultUnitId) } : {}),
				...(hasLabelUrl ? { labelUrl: labelUrl ?? null } : {}),
				...(hasMsdsUrl ? { msdsUrl: msdsUrl ?? null } : {}),
				...(hasShorthand ? { shorthand: shorthand ?? null } : {}),
				...(hasMetadata ? { metadata: metadata ?? null } : {}),
			},
			acknowledgedHistoricalProductChange: input.acknowledgedHistoricalProductChange ?? false,
		},
	};
}

export function deactivateInsecticideCommand(
	input: DeactivateInsecticideCommandInput,
): DeactivateInsecticideCommand {
	const issues = validateIdCommand(input, 'insecticideId');
	throwIfIssues('Deactivate insecticide command is invalid.', issues);
	return {
		type: 'controlOperations.deactivateInsecticide',
		payload: {
			...basePayload(input),
			insecticideId: normalizeRequiredId(input.insecticideId),
			acknowledgedDependentDeactivation: input.acknowledgedDependentDeactivation ?? false,
		},
	};
}

export function reactivateInsecticideCommand(
	input: InsecticideIdCommandInput,
): ReactivateInsecticideCommand {
	return idCommand('controlOperations.reactivateInsecticide', input, 'insecticideId');
}

export function deleteInsecticideCommand(
	input: InsecticideIdCommandInput,
): DeleteInsecticideCommand {
	return idCommand('controlOperations.deleteInsecticide', input, 'insecticideId');
}

export function createInsecticideBatchCommand(
	input: CreateInsecticideBatchCommandInput,
): CreateInsecticideBatchCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.insecticideBatchId, 'insecticideBatchId', issues);
	requireUuid(input.insecticideId, 'insecticideId', issues);
	const batchName = normalizeRequiredText(input.batchName, 'batchName', issues, 200);
	throwIfIssues('Create insecticide batch command is invalid.', issues);
	return {
		type: 'controlOperations.createInsecticideBatch',
		payload: {
			...basePayload(input),
			insecticideBatchId: normalizeRequiredId(input.insecticideBatchId),
			insecticideId: normalizeRequiredId(input.insecticideId),
			batchName,
		},
	};
}

export function updateInsecticideBatchCommand(
	input: UpdateInsecticideBatchCommandInput,
): UpdateInsecticideBatchCommand {
	const issues = validateIdCommand(input, 'insecticideBatchId');
	const hasName = input.batchName !== undefined;
	if (!hasName) {
		issues.push({ path: 'changes', message: 'At least one insecticide batch field must change.' });
	}
	const batchName = hasName
		? normalizeRequiredText(input.batchName, 'batchName', issues, 200)
		: undefined;
	throwIfIssues('Update insecticide batch command is invalid.', issues);
	return {
		type: 'controlOperations.updateInsecticideBatch',
		payload: {
			...basePayload(input),
			insecticideBatchId: normalizeRequiredId(input.insecticideBatchId),
			changes: {
				...(batchName !== undefined ? { batchName } : {}),
			},
			acknowledgedHistoricalBatchLabelChange: input.acknowledgedHistoricalBatchLabelChange ?? false,
		},
	};
}

export function deactivateInsecticideBatchCommand(
	input: InsecticideBatchIdCommandInput,
): DeactivateInsecticideBatchCommand {
	return idCommand('controlOperations.deactivateInsecticideBatch', input, 'insecticideBatchId');
}

export function reactivateInsecticideBatchCommand(
	input: InsecticideBatchIdCommandInput,
): ReactivateInsecticideBatchCommand {
	return idCommand('controlOperations.reactivateInsecticideBatch', input, 'insecticideBatchId');
}

export function deleteInsecticideBatchCommand(
	input: InsecticideBatchIdCommandInput,
): DeleteInsecticideBatchCommand {
	return idCommand('controlOperations.deleteInsecticideBatch', input, 'insecticideBatchId');
}

export function createFormulationCommand(
	input: CreateFormulationCommandInput,
): CreateFormulationCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.formulationId, 'formulationId', issues);
	const formulationName = normalizeRequiredText(
		input.formulationName,
		'formulationName',
		issues,
		200,
	);
	const description = normalizeNullableText(input.description, 'description', issues, 2_000);
	const batchSize = normalizePositiveFiniteNumber(input.batchSize, 'batchSize', issues);
	requireUuid(input.batchUnitId, 'batchUnitId', issues);
	throwIfIssues('Create formulation command is invalid.', issues);
	return {
		type: 'controlOperations.createFormulation',
		payload: {
			...basePayload(input),
			formulationId: normalizeRequiredId(input.formulationId),
			formulationName,
			description,
			batchSize,
			batchUnitId: normalizeRequiredId(input.batchUnitId),
		},
	};
}

export function updateFormulationDetailsCommand(
	input: UpdateFormulationDetailsCommandInput,
): UpdateFormulationDetailsCommand {
	const issues = validateIdCommand(input, 'formulationId');
	const hasName = input.formulationName !== undefined;
	const hasDescription = input.description !== undefined;
	const hasBatchSize = input.batchSize !== undefined;
	const hasBatchUnit = input.batchUnitId !== undefined;
	if (!hasName && !hasDescription && !hasBatchSize && !hasBatchUnit) {
		issues.push({ path: 'changes', message: 'At least one formulation field must change.' });
	}
	const formulationName = hasName
		? normalizeRequiredText(input.formulationName, 'formulationName', issues, 200)
		: undefined;
	const description = hasDescription
		? normalizeNullableText(input.description, 'description', issues, 2_000)
		: undefined;
	const batchSize = hasBatchSize
		? normalizePositiveFiniteNumber(input.batchSize, 'batchSize', issues)
		: undefined;
	if (hasBatchUnit) {
		requireUuid(input.batchUnitId, 'batchUnitId', issues);
	}
	throwIfIssues('Update formulation details command is invalid.', issues);
	return {
		type: 'controlOperations.updateFormulationDetails',
		payload: {
			...basePayload(input),
			formulationId: normalizeRequiredId(input.formulationId),
			changes: {
				...(formulationName !== undefined ? { formulationName } : {}),
				...(hasDescription ? { description: description ?? null } : {}),
				...(batchSize !== undefined ? { batchSize } : {}),
				...(hasBatchUnit ? { batchUnitId: normalizeRequiredId(input.batchUnitId) } : {}),
			},
		},
	};
}

export function activateFormulationCommand(
	input: FormulationIdCommandInput,
): ActivateFormulationCommand {
	return idCommand('controlOperations.activateFormulation', input, 'formulationId');
}

export function deactivateFormulationCommand(
	input: FormulationIdCommandInput,
): DeactivateFormulationCommand {
	return idCommand('controlOperations.deactivateFormulation', input, 'formulationId');
}

export function deleteFormulationCommand(
	input: DeleteFormulationCommandInput,
): DeleteFormulationCommand {
	const issues = validateIdCommand(input, 'formulationId');
	throwIfIssues('Delete formulation command is invalid.', issues);
	return {
		type: 'controlOperations.deleteFormulation',
		payload: {
			...basePayload(input),
			formulationId: normalizeRequiredId(input.formulationId),
			acknowledgedComponentDeletion: input.acknowledgedComponentDeletion ?? false,
		},
	};
}

export function addFormulationInsecticideCommand(
	input: AddFormulationInsecticideCommandInput,
): AddFormulationInsecticideCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.formulationInsecticideId, 'formulationInsecticideId', issues);
	requireUuid(input.formulationId, 'formulationId', issues);
	requireUuid(input.insecticideId, 'insecticideId', issues);
	const amount = normalizePositiveFiniteNumber(input.amount, 'amount', issues);
	requireUuid(input.unitId, 'unitId', issues);
	throwIfIssues('Add formulation insecticide command is invalid.', issues);
	return {
		type: 'controlOperations.addFormulationInsecticide',
		payload: {
			...basePayload(input),
			formulationInsecticideId: normalizeRequiredId(input.formulationInsecticideId),
			formulationId: normalizeRequiredId(input.formulationId),
			insecticideId: normalizeRequiredId(input.insecticideId),
			amount,
			unitId: normalizeRequiredId(input.unitId),
		},
	};
}

export function updateFormulationInsecticideCommand(
	input: UpdateFormulationInsecticideCommandInput,
): UpdateFormulationInsecticideCommand {
	const issues = validateIdCommand(input, 'formulationInsecticideId');
	const hasInsecticide = input.insecticideId !== undefined;
	const hasAmount = input.amount !== undefined;
	const hasUnit = input.unitId !== undefined;
	if (!hasInsecticide && !hasAmount && !hasUnit) {
		issues.push({
			path: 'changes',
			message: 'At least one formulation component field must change.',
		});
	}
	if (hasInsecticide) {
		requireUuid(input.insecticideId, 'insecticideId', issues);
	}
	if (hasUnit) {
		requireUuid(input.unitId, 'unitId', issues);
	}
	const amount = hasAmount
		? normalizePositiveFiniteNumber(input.amount, 'amount', issues)
		: undefined;
	throwIfIssues('Update formulation insecticide command is invalid.', issues);
	return {
		type: 'controlOperations.updateFormulationInsecticide',
		payload: {
			...basePayload(input),
			formulationInsecticideId: normalizeRequiredId(input.formulationInsecticideId),
			changes: {
				...(hasInsecticide ? { insecticideId: normalizeRequiredId(input.insecticideId) } : {}),
				...(amount !== undefined ? { amount } : {}),
				...(hasUnit ? { unitId: normalizeRequiredId(input.unitId) } : {}),
			},
			acknowledgedDeactivateEmptyFormulation: input.acknowledgedDeactivateEmptyFormulation ?? false,
		},
	};
}

export function removeFormulationInsecticideCommand(
	input: RemoveFormulationInsecticideCommandInput,
): RemoveFormulationInsecticideCommand {
	const issues = validateIdCommand(input, 'formulationInsecticideId');
	throwIfIssues('Remove formulation insecticide command is invalid.', issues);
	return {
		type: 'controlOperations.removeFormulationInsecticide',
		payload: {
			...basePayload(input),
			formulationInsecticideId: normalizeRequiredId(input.formulationInsecticideId),
			acknowledgedDeactivateEmptyFormulation: input.acknowledgedDeactivateEmptyFormulation ?? false,
		},
	};
}

/**
 * Scale a formulation's components to the amount of mix that went out.
 *
 * A formulation is a recipe: one batch makes `batchSize` of finished mix and
 * takes `amount` of each product. Applying `totalAmount` of that mix is
 * `totalAmount / batchSize` batches, so each product scales by the same factor
 * and stays in its own unit — 0.5 lb per 26 gal, applied over 78 gal, is 1.5 lb.
 *
 * No unit conversion happens here, and none is needed: the batch amount and each
 * product amount are each read back in the unit they were entered in.
 */
export function calculateFormulationComponentAmounts(
	input: CalculateFormulationComponentAmountsInput,
): readonly FormulationComponentAmount[] {
	const issues = createIssues();
	const totalAmount = normalizePositiveFiniteNumber(input.totalAmount, 'totalAmount', issues);
	const batchSize = normalizePositiveFiniteNumber(input.batchSize, 'batchSize', issues);
	if (!Array.isArray(input.components) || input.components.length === 0) {
		issues.push({ path: 'components', message: 'At least one formulation component is required.' });
	}
	const seen = new Set<string>();
	const components = (input.components ?? []).map((component, index) => {
		requireUuid(component.insecticideId, `components.${index}.insecticideId`, issues);
		const insecticideId = normalizeRequiredId(component.insecticideId);
		if (seen.has(insecticideId)) {
			issues.push({
				path: `components.${index}.insecticideId`,
				message: 'Component insecticide ids must be unique.',
			});
		}
		seen.add(insecticideId);
		requireUuid(component.unitId, `components.${index}.unitId`, issues);
		const amount = normalizePositiveFiniteNumber(
			component.amount,
			`components.${index}.amount`,
			issues,
		);
		return { insecticideId, amount, unitId: normalizeRequiredId(component.unitId) };
	});
	throwIfIssues('Formulation component amounts are invalid.', issues);
	const batches = totalAmount / batchSize;
	return components.map((component) => ({
		insecticideId: component.insecticideId,
		unitId: component.unitId,
		amount: Number((component.amount * batches).toFixed(6)),
	}));
}

export function expandFormulationApplicationCommands(
	input: ExpandFormulationApplicationCommandsInput,
): readonly RecordChemicalApplicationCommand[] {
	const amounts = calculateFormulationComponentAmounts(input);
	const amountByInsecticide = new Map(amounts.map((amount) => [amount.insecticideId, amount]));
	const applicationIds = new Set<string>();
	return input.components.map((component, index) => {
		const applicationId = normalizeRequiredId(component.applicationId);
		const issues = createIssues();
		requireUuid(component.applicationId, `components.${index}.applicationId`, issues);
		if (applicationIds.has(applicationId)) {
			issues.push({
				path: `components.${index}.applicationId`,
				message: 'Generated application ids must be unique.',
			});
		}
		applicationIds.add(applicationId);
		const amount = amountByInsecticide.get(normalizeRequiredId(component.insecticideId));
		if (amount === undefined) {
			issues.push({
				path: `components.${index}.insecticideId`,
				message: 'Component amount could not be calculated.',
			});
		}
		throwIfIssues('Formulation application expansion is invalid.', issues);
		const commandInput: RecordChemicalApplicationCommandInput = {
			organizationId: input.organizationId,
			actorProfileId: input.actorProfileId,
			applicationId: component.applicationId,
			insecticideId: component.insecticideId,
			amountApplied: amount?.amount ?? 0,
			// Each generated application is recorded in its own product's unit —
			// pounds of granules out of a mix measured in gallons.
			applicationUnitId: amount?.unitId ?? component.unitId,
			applicationDate: input.applicationDate,
			locationSource: input.locationSource,
			...(input.applicatorProfileId !== undefined
				? { applicatorProfileId: input.applicatorProfileId }
				: {}),
			...(input.addressId !== undefined ? { addressId: input.addressId } : {}),
			...(input.context !== undefined ? { context: input.context } : {}),
			...(input.requestedControlActionId !== undefined
				? { requestedControlActionId: input.requestedControlActionId }
				: {}),
			...(input.applicationMethodId !== undefined
				? { applicationMethodId: input.applicationMethodId }
				: {}),
			...(input.vehicleId !== undefined ? { vehicleId: input.vehicleId } : {}),
			...(input.equipmentId !== undefined ? { equipmentId: input.equipmentId } : {}),
			...(component.applicationBatches !== undefined
				? { applicationBatches: component.applicationBatches }
				: {}),
			...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
		};
		return recordChemicalApplicationCommand(commandInput);
	});
}
