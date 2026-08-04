import {
	createIssues,
	isFutureBeyondClockSkew,
	nullableText as normalizeNullableText,
	optionalUuid as normalizeOptionalUuid,
	requiredId as normalizeRequiredId,
	requiredUuid as requireUuid,
	throwIfIssues,
	validateAgencyCommandContext,
} from '../command-validation.js';
import {
	type ControlActionLocationSource,
	type ControlActionLocationSourceInput,
	type RequestedControlActionLocationSource,
	type RequestedControlActionLocationSourceInput,
	validateControlActionLocationSource,
	validateRequestedControlActionLocationSource,
} from '../location-intent.js';
import type { ControlActionContext } from '../performed-control-actions.js';
import type { DomainId, DomainValidationIssue } from '../shared.js';

export type InsecticideType = 'larvicide' | 'adulticide' | 'pupicide' | 'other';

export type ControlOperationsCommandType =
	| 'controlOperations.createApplicationMethod'
	| 'controlOperations.updateApplicationMethod'
	| 'controlOperations.deactivateApplicationMethod'
	| 'controlOperations.reactivateApplicationMethod'
	| 'controlOperations.deleteApplicationMethod'
	| 'controlOperations.createSourceReductionMethod'
	| 'controlOperations.updateSourceReductionMethod'
	| 'controlOperations.deactivateSourceReductionMethod'
	| 'controlOperations.reactivateSourceReductionMethod'
	| 'controlOperations.deleteSourceReductionMethod'
	| 'controlOperations.createOutreachMethod'
	| 'controlOperations.updateOutreachMethod'
	| 'controlOperations.deactivateOutreachMethod'
	| 'controlOperations.reactivateOutreachMethod'
	| 'controlOperations.deleteOutreachMethod'
	| 'controlOperations.createBiocontrolMethod'
	| 'controlOperations.updateBiocontrolMethod'
	| 'controlOperations.deactivateBiocontrolMethod'
	| 'controlOperations.reactivateBiocontrolMethod'
	| 'controlOperations.deleteBiocontrolMethod'
	| 'controlOperations.createVehicle'
	| 'controlOperations.updateVehicle'
	| 'controlOperations.deactivateVehicle'
	| 'controlOperations.reactivateVehicle'
	| 'controlOperations.deleteVehicle'
	| 'controlOperations.createEquipment'
	| 'controlOperations.updateEquipment'
	| 'controlOperations.deactivateEquipment'
	| 'controlOperations.reactivateEquipment'
	| 'controlOperations.deleteEquipment'
	| 'controlOperations.createInsecticide'
	| 'controlOperations.updateInsecticide'
	| 'controlOperations.deactivateInsecticide'
	| 'controlOperations.reactivateInsecticide'
	| 'controlOperations.deleteInsecticide'
	| 'controlOperations.createInsecticideBatch'
	| 'controlOperations.updateInsecticideBatch'
	| 'controlOperations.deactivateInsecticideBatch'
	| 'controlOperations.reactivateInsecticideBatch'
	| 'controlOperations.deleteInsecticideBatch'
	| 'controlOperations.createFormulation'
	| 'controlOperations.updateFormulationDetails'
	| 'controlOperations.activateFormulation'
	| 'controlOperations.deactivateFormulation'
	| 'controlOperations.deleteFormulation'
	| 'controlOperations.addFormulationInsecticide'
	| 'controlOperations.updateFormulationInsecticide'
	| 'controlOperations.removeFormulationInsecticide'
	| 'controlOperations.recordChemicalApplication'
	| 'controlOperations.updateChemicalApplicationFieldDetails'
	| 'controlOperations.updateChemicalApplicationLocationAndContext'
	| 'controlOperations.deleteChemicalApplication'
	| 'controlOperations.addChemicalApplicationBatch'
	| 'controlOperations.removeChemicalApplicationBatch'
	| 'controlOperations.recordSourceReduction'
	| 'controlOperations.updateSourceReductionFieldDetails'
	| 'controlOperations.updateSourceReductionLocationAndContext'
	| 'controlOperations.deleteSourceReduction'
	| 'controlOperations.recordOutreachAction'
	| 'controlOperations.updateOutreachActionFieldDetails'
	| 'controlOperations.updateOutreachActionLocationAndContext'
	| 'controlOperations.deleteOutreachAction'
	| 'controlOperations.recordBiocontrolAction'
	| 'controlOperations.updateBiocontrolActionFieldDetails'
	| 'controlOperations.updateBiocontrolActionLocationAndContext'
	| 'controlOperations.deleteBiocontrolAction'
	| 'controlOperations.requestControlAction'
	| 'controlOperations.updateRequestedControlActionDetails'
	| 'controlOperations.updateRequestedControlActionLocationAndContext'
	| 'controlOperations.resolveRequestedControlAction'
	| 'controlOperations.reopenRequestedControlAction'
	| 'controlOperations.deleteRequestedControlAction';

export interface ControlOperationsDomainCommand<
	TType extends ControlOperationsCommandType,
	TPayload,
> {
	readonly type: TType;
	readonly payload: TPayload;
}

export interface ControlCommandInput {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export interface ControlCommandPayload {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export const CONTROL_TYPES = ['application', 'source_reduction', 'biocontrol', 'outreach'] as const;
export const INSECTICIDE_TYPES = ['larvicide', 'adulticide', 'pupicide', 'other'] as const;
export const SOURCE_REDUCTION_UNIT_TYPES = ['count', 'distance', 'area', 'volume'] as const;
export const BIOCONTROL_UNIT_TYPES = ['count', 'volume', 'weight'] as const;

export function idCommand<
	TType extends ControlOperationsCommandType,
	TInput extends ControlCommandInput,
	TIdKey extends keyof TInput & string,
>(
	type: TType,
	input: TInput,
	idKey: TIdKey,
): ControlOperationsDomainCommand<TType, ControlCommandPayload & Record<TIdKey, DomainId>> {
	const issues = validateIdCommand(input, idKey);
	throwIfIssues(`${humanizeCommandType(type)} command is invalid.`, issues);
	return {
		type,
		payload: {
			...basePayload(input),
			[idKey]: normalizeRequiredId(input[idKey] as string | undefined),
		} as ControlCommandPayload & Record<TIdKey, DomainId>,
	};
}

export type LocationSourceFlow = 'controlAction' | 'requestedControlAction';

export function validateControlActionLocationSourceInput(
	input: {
		readonly locationSource?: ControlActionLocationSourceInput;
	},
	issues: DomainValidationIssue[],
): ControlActionLocationSource {
	if (input.locationSource !== undefined) {
		return validateControlActionLocationSource(input.locationSource, 'locationSource', issues);
	}
	issues.push({ path: 'locationSource', message: 'locationSource is required.' });
	return validateControlActionLocationSource(
		{ kind: 'geometry', geometry: { type: 'Point', coordinates: [0, 0] } },
		'locationSource',
		issues,
	);
}

export function validateRequestedControlActionLocationSourceInput(
	input: {
		readonly locationSource?: RequestedControlActionLocationSourceInput;
	},
	issues: DomainValidationIssue[],
): RequestedControlActionLocationSource {
	if (input.locationSource !== undefined) {
		return validateRequestedControlActionLocationSource(
			input.locationSource,
			'locationSource',
			issues,
		);
	}
	issues.push({ path: 'locationSource', message: 'locationSource is required.' });
	return validateRequestedControlActionLocationSource(
		{ kind: 'geometry', geometry: { type: 'Point', coordinates: [0, 0] } },
		'locationSource',
		issues,
	);
}

export function validateLocationContextPatchBase<TInput extends ControlCommandInput>(
	input: TInput,
	idKey: keyof TInput & string,
	flow: LocationSourceFlow,
): DomainValidationIssue[] {
	const issues = validateIdCommand(input, idKey);
	const hasLocation = 'locationSource' in input && input.locationSource !== undefined;
	const hasAddress = 'addressId' in input && input.addressId !== undefined;
	const hasContext = 'context' in input && input.context !== undefined;
	const hasRequested =
		'requestedControlActionId' in input && input.requestedControlActionId !== undefined;
	if (!hasLocation && !hasAddress && !hasContext && !hasRequested) {
		issues.push({
			path: 'changes',
			message: 'At least one location or context field must change.',
		});
	}
	if (hasLocation) {
		validatePatchLocationSource(
			input as {
				readonly locationSource?:
					| ControlActionLocationSourceInput
					| RequestedControlActionLocationSourceInput;
			},
			flow,
			issues,
		);
	}
	if (hasAddress) {
		normalizeOptionalUuid(input.addressId as string | null | undefined, 'addressId', issues);
	}
	if (hasRequested) {
		normalizeOptionalUuid(
			input.requestedControlActionId as string | null | undefined,
			'requestedControlActionId',
			issues,
		);
	}
	return issues;
}

export function locationContextChanges(
	input: {
		readonly locationSource?:
			| ControlActionLocationSourceInput
			| RequestedControlActionLocationSourceInput;
		readonly addressId?: DomainId | null;
		readonly requestedControlActionId?: DomainId | null;
	},
	context: ControlActionContext | undefined,
	issues: DomainValidationIssue[],
	flow: LocationSourceFlow,
): Readonly<{
	readonly locationSource?: ControlActionLocationSource | RequestedControlActionLocationSource;
	readonly addressId?: DomainId | null;
	readonly context?: ControlActionContext;
	readonly requestedControlActionId?: DomainId | null;
}> {
	const hasLocation = input.locationSource !== undefined;
	const hasAddress = input.addressId !== undefined;
	const hasRequested = input.requestedControlActionId !== undefined;
	return {
		...(hasLocation
			? {
					locationSource: validatePatchLocationSource(input, flow, issues),
				}
			: {}),
		...(hasAddress
			? { addressId: normalizeOptionalUuid(input.addressId, 'addressId', issues) }
			: {}),
		...(context !== undefined ? { context } : {}),
		...(hasRequested
			? {
					requestedControlActionId: normalizeOptionalUuid(
						input.requestedControlActionId,
						'requestedControlActionId',
						issues,
					),
				}
			: {}),
	};
}

export function validatePatchLocationSource(
	input: {
		readonly locationSource?:
			| ControlActionLocationSourceInput
			| RequestedControlActionLocationSourceInput;
	},
	flow: LocationSourceFlow,
	issues: DomainValidationIssue[],
): ControlActionLocationSource | RequestedControlActionLocationSource {
	return flow === 'controlAction'
		? validateControlActionLocationSourceInput(
				input as { readonly locationSource?: ControlActionLocationSourceInput },
				issues,
			)
		: validateRequestedControlActionLocationSourceInput(
				input as { readonly locationSource?: RequestedControlActionLocationSourceInput },
				issues,
			);
}

export function validateBase(input: ControlCommandInput, issues: DomainValidationIssue[]): void {
	validateAgencyCommandContext(input, issues);
}

export function validateIdCommand<T extends ControlCommandInput>(
	input: T,
	idKey: keyof T & string,
): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input[idKey] as string | undefined, idKey, issues);
	return issues;
}

export function basePayload(input: ControlCommandInput): ControlCommandPayload {
	return validateAgencyCommandContext(input, createIssues());
}

export function normalizeOptionalTimestamp(
	value: Date | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
	allowFuture: boolean,
): Date | null {
	if (value === undefined || value === null) {
		return null;
	}
	if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
		issues.push({ path, message: `${path} must be a valid Date.` });
		return null;
	}
	if (!allowFuture && isFutureBeyondClockSkew(value)) {
		issues.push({ path, message: `${path} cannot be in the future.` });
	}
	return value;
}

export function normalizePositiveFiniteNumber(
	value: number | undefined,
	path: string,
	issues: DomainValidationIssue[],
): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
		issues.push({ path, message: `${path} must be a positive finite number.` });
		return 0;
	}
	return value;
}

export function normalizeNonnegativeFiniteNumber(
	value: number | undefined,
	path: string,
	issues: DomainValidationIssue[],
): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
		issues.push({ path, message: `${path} must be a nonnegative finite number.` });
		return 0;
	}
	return value;
}

export function normalizePositiveInteger(
	value: number | undefined,
	path: string,
	issues: DomainValidationIssue[],
): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
		issues.push({ path, message: `${path} must be a positive integer.` });
		return 0;
	}
	return value;
}

export function normalizeNullableUrl(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): string | null {
	const normalized = normalizeNullableText(value, path, issues, 2_000);
	if (normalized === null) {
		return null;
	}
	if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(normalized)) {
		issues.push({ path, message: `${path} must be a valid URL.` });
		return null;
	}
	return normalized;
}

export function normalizeStringUnion<TValue extends string>(
	value: string | undefined,
	allowedValues: readonly TValue[],
	path: string,
	issues: DomainValidationIssue[],
): TValue {
	if (value === undefined || !allowedValues.includes(value as TValue)) {
		issues.push({ path, message: `${path} is not supported.` });
		return (allowedValues[0] ?? '') as TValue;
	}
	return value as TValue;
}

export function humanizeCommandType(type: string): string {
	const command = type.split('.').at(-1) ?? type;
	return command.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
}
