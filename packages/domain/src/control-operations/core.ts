import {
	basePayload,
	nullableText as normalizeNullableText,
	optionalUuid as normalizeOptionalUuid,
	requiredId as normalizeRequiredId,
	throwIfIssues,
	validateIdCommand,
} from '../command-validation.js';
import {
	type LocationSourceFlowName,
	type LocationSourceFor,
	type LocationSourceInputFor,
	validateLocationSourceInput,
} from '../location-intent.js';
import type { ControlActionContext } from '../performed-control-actions.js';
import type { DomainId, DomainValidationIssue } from '../shared.js';

export {
	CONTROL_TYPES,
	INSECTICIDE_TYPES,
	type InsecticideType,
} from '../column-vocabularies.js';

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

/**
 * The two flows a control command patches a location on.
 *
 * Extracted from the register's own key union rather than written out, so a row
 * that is renamed fails here instead of narrowing what these helpers accept.
 */
export type LocationSourceFlow = Extract<
	LocationSourceFlowName,
	'controlAction' | 'requestedControlAction'
>;

/**
 * The checks every location and context patch shares, held to one flow.
 *
 * `TFlow` is inferred from the `flow` argument alone, which is what relates the
 * patch to its register row: `TInput`'s constraint names
 * `LocationSourceInputFor<TFlow>`, so a patch carrying a source its flow does
 * not list fails `tsc` here rather than at the run-time refusal below. The flow
 * used to arrive as the `LocationSourceFlow` union, which widened the accepted
 * input to both flows' sources and cost a cast on the way into
 * {@link validateLocationSourceInput}.
 *
 * A constraint rather than a second parameter position, so nothing else can
 * offer a candidate for `TFlow` and widen it back to the union.
 */
export function validateLocationContextPatchBase<
	TFlow extends LocationSourceFlow,
	TInput extends ControlCommandInput & {
		readonly locationSource?: LocationSourceInputFor<TFlow>;
	},
>(input: TInput, idKey: keyof TInput & string, flow: TFlow): DomainValidationIssue[] {
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
		validateLocationSourceInput(input, flow, issues);
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

/**
 * The changed fields a location and context patch carries, held to one flow.
 *
 * `NoInfer` says that `flow` is the only place `TFlow` comes from. A generic
 * inferred from two positions constrains neither: a second candidate off the
 * input would widen `TFlow` back to the union of the two flows and take a source
 * the row does not list, while the signature still read as if it checked. It
 * costs nothing today, because `TFlow` sits inside an indexed access in
 * `LocationSourceInputFor` and offers no candidate from there, but that is a
 * property of how that type is written rather than of this signature, and the
 * marker is what keeps the guarantee where a reader can see it. What proves the
 * refusal either way is the compile-fail case in
 * `tests/unit/control-operations.test.ts`.
 *
 * The return is read off the same row, which is what lets the five callers drop
 * the cast they carried on this result.
 */
export function locationContextChanges<TFlow extends LocationSourceFlow>(
	input: {
		readonly locationSource?: NoInfer<LocationSourceInputFor<TFlow>>;
		readonly addressId?: DomainId | null;
		readonly requestedControlActionId?: DomainId | null;
	},
	context: ControlActionContext | undefined,
	issues: DomainValidationIssue[],
	flow: TFlow,
): Readonly<{
	readonly locationSource?: LocationSourceFor<TFlow>;
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
					locationSource: validateLocationSourceInput(input, flow, issues),
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

function humanizeCommandType(type: string): string {
	const command = type.split('.').at(-1) ?? type;
	return command.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
}
