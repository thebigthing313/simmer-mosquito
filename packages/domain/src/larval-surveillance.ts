import {
	type DomainId,
	DomainValidationError,
	type DomainValidationIssue,
	type JsonObject,
	type LocalDateString,
} from './adult-surveillance.js';

export type LarvalDensity = 'none' | 'light' | 'medium' | 'heavy' | 'very_heavy';
export type LarvalInspectionEntryMode = 'density_only' | 'count_and_dips_required' | 'hybrid';

export type ImmatureStageFlag =
	| 'hasFirstInstar'
	| 'hasSecondInstar'
	| 'hasThirdInstar'
	| 'hasFourthInstar'
	| 'hasPupae'
	| 'hasEggs';

export type LarvalSurveillanceCommandType =
	| 'larvalSurveillance.createHabitat'
	| 'larvalSurveillance.createHabitatFromInspection'
	| 'larvalSurveillance.updateHabitatDetails'
	| 'larvalSurveillance.updateHabitatLocation'
	| 'larvalSurveillance.updateHabitatConfiguration'
	| 'larvalSurveillance.markHabitatInaccessible'
	| 'larvalSurveillance.clearHabitatInaccessible'
	| 'larvalSurveillance.retireHabitat'
	| 'larvalSurveillance.reactivateHabitat'
	| 'larvalSurveillance.deleteHabitat'
	| 'larvalSurveillance.mergeHabitats'
	| 'larvalSurveillance.recordHabitatInspection'
	| 'larvalSurveillance.recordAdHocInspection'
	| 'larvalSurveillance.updateInspectionFieldDetails'
	| 'larvalSurveillance.updateAdHocInspectionLocation'
	| 'larvalSurveillance.deleteInspection'
	| 'larvalSurveillance.addInspectionSample'
	| 'larvalSurveillance.addUnlabeledInspectionSample'
	| 'larvalSurveillance.updateInspectionSample'
	| 'larvalSurveillance.deleteInspectionSample'
	| 'larvalSurveillance.markSampleZeroLarvae'
	| 'larvalSurveillance.clearSampleZeroLarvae'
	| 'larvalSurveillance.setSampleNonMosquitoPresence'
	| 'larvalSurveillance.setSampleUnidentifiableReason'
	| 'larvalSurveillance.addSampleSpeciesCount'
	| 'larvalSurveillance.updateSampleSpeciesCount'
	| 'larvalSurveillance.deleteSampleSpeciesCount';

export interface LarvalDomainCommand<TType extends LarvalSurveillanceCommandType, TPayload> {
	readonly type: TType;
	readonly payload: TPayload;
}

interface LarvalCommandInput {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

interface LarvalCommandPayload {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export interface LarvalDensityRange {
	readonly minInclusive: number;
	readonly maxExclusive?: number | null;
}

export interface LarvalDensityRanges {
	readonly light: LarvalDensityRange;
	readonly medium: LarvalDensityRange;
	readonly heavy: LarvalDensityRange;
	readonly veryHeavy: LarvalDensityRange;
}

export interface LarvalInspectionEntryPolicy {
	readonly mode?: LarvalInspectionEntryMode;
	readonly densityRanges?: LarvalDensityRanges | null;
}

export interface ImmatureStageFlags {
	readonly hasFirstInstar: boolean;
	readonly hasSecondInstar: boolean;
	readonly hasThirdInstar: boolean;
	readonly hasFourthInstar: boolean;
	readonly hasPupae: boolean;
	readonly hasEggs: boolean;
}

interface LarvalInspectionResultInput extends Partial<ImmatureStageFlags> {
	readonly isWet: boolean;
	readonly dipCount?: number | null;
	readonly density?: LarvalDensity | null;
	readonly larvaeCount?: number | null;
	readonly policy?: LarvalInspectionEntryPolicy | null;
}

export interface NormalizedLarvalInspectionResult extends ImmatureStageFlags {
	readonly isWet: boolean;
	readonly dipCount: number | null;
	readonly density: LarvalDensity | null;
	readonly larvaeCount: number | null;
	readonly isBreedingPositive: boolean;
}

export interface CreateHabitatCommandInput extends LarvalCommandInput {
	readonly habitatId: DomainId;
	readonly featureId: DomainId;
	readonly addressId?: DomainId | null;
	readonly habitatTypeId?: DomainId | null;
	readonly habitatName?: string | null;
	readonly description: string;
	readonly metadata?: unknown | null;
}

export interface CreateHabitatCommandPayload extends LarvalCommandPayload {
	readonly habitatId: DomainId;
	readonly featureId: DomainId;
	readonly addressId: DomainId | null;
	readonly habitatTypeId: DomainId | null;
	readonly habitatName: string | null;
	readonly description: string;
	readonly metadata: JsonObject | null;
}

export type CreateHabitatCommand = LarvalDomainCommand<
	'larvalSurveillance.createHabitat',
	CreateHabitatCommandPayload
>;

export interface CreateHabitatFromInspectionCommandInput extends LarvalCommandInput {
	readonly habitatId: DomainId;
	readonly inspectionId: DomainId;
	readonly habitatName?: string | null;
	readonly description: string;
	readonly metadata?: unknown | null;
}

export type CreateHabitatFromInspectionCommand = LarvalDomainCommand<
	'larvalSurveillance.createHabitatFromInspection',
	LarvalCommandPayload & {
		readonly habitatId: DomainId;
		readonly inspectionId: DomainId;
		readonly habitatName: string | null;
		readonly description: string;
		readonly metadata: JsonObject | null;
	}
>;

export interface UpdateHabitatDetailsCommandInput extends LarvalCommandInput {
	readonly habitatId: DomainId;
	readonly habitatName?: string | null;
	readonly description?: string;
	readonly metadata?: unknown | null;
}

export type UpdateHabitatDetailsCommand = LarvalDomainCommand<
	'larvalSurveillance.updateHabitatDetails',
	LarvalCommandPayload & {
		readonly habitatId: DomainId;
		readonly changes: Readonly<{
			readonly habitatName?: string | null;
			readonly description?: string;
			readonly metadata?: JsonObject | null;
		}>;
	}
>;

export interface UpdateHabitatLocationCommandInput extends LarvalCommandInput {
	readonly habitatId: DomainId;
	readonly featureId: DomainId;
	readonly acknowledgedHabitatLocationSemanticsChange?: boolean;
}

export type UpdateHabitatLocationCommand = LarvalDomainCommand<
	'larvalSurveillance.updateHabitatLocation',
	LarvalCommandPayload & {
		readonly habitatId: DomainId;
		readonly featureId: DomainId;
		readonly acknowledgedHabitatLocationSemanticsChange: boolean;
	}
>;

export interface UpdateHabitatConfigurationCommandInput extends LarvalCommandInput {
	readonly habitatId: DomainId;
	readonly addressId?: DomainId | null;
	readonly habitatTypeId?: DomainId | null;
	readonly acknowledgedHabitatConfigurationSemanticsChange?: boolean;
}

export type UpdateHabitatConfigurationCommand = LarvalDomainCommand<
	'larvalSurveillance.updateHabitatConfiguration',
	LarvalCommandPayload & {
		readonly habitatId: DomainId;
		readonly changes: Readonly<{
			readonly addressId?: DomainId | null;
			readonly habitatTypeId?: DomainId | null;
		}>;
		readonly acknowledgedHabitatConfigurationSemanticsChange: boolean;
	}
>;

export interface HabitatIdCommandInput extends LarvalCommandInput {
	readonly habitatId: DomainId;
}

export type MarkHabitatInaccessibleCommand = LarvalDomainCommand<
	'larvalSurveillance.markHabitatInaccessible',
	LarvalCommandPayload & { readonly habitatId: DomainId }
>;

export type ClearHabitatInaccessibleCommand = LarvalDomainCommand<
	'larvalSurveillance.clearHabitatInaccessible',
	LarvalCommandPayload & { readonly habitatId: DomainId }
>;

export interface RetireHabitatCommandInput extends HabitatIdCommandInput {
	readonly acknowledgedRouteRemoval?: boolean;
}

export type RetireHabitatCommand = LarvalDomainCommand<
	'larvalSurveillance.retireHabitat',
	LarvalCommandPayload & {
		readonly habitatId: DomainId;
		readonly acknowledgedRouteRemoval: boolean;
	}
>;

export type ReactivateHabitatCommand = LarvalDomainCommand<
	'larvalSurveillance.reactivateHabitat',
	LarvalCommandPayload & { readonly habitatId: DomainId }
>;

export interface DeleteHabitatCommandInput extends HabitatIdCommandInput {
	readonly acknowledgedHabitatDelete?: boolean;
	readonly acknowledgedInspectionDetach?: boolean;
	readonly acknowledgedCrossDomainDetach?: boolean;
}

export type DeleteHabitatCommand = LarvalDomainCommand<
	'larvalSurveillance.deleteHabitat',
	LarvalCommandPayload & {
		readonly habitatId: DomainId;
		readonly acknowledgedHabitatDelete: boolean;
		readonly acknowledgedInspectionDetach: boolean;
		readonly acknowledgedCrossDomainDetach: boolean;
	}
>;

export interface MergeHabitatsCommandInput extends LarvalCommandInput {
	readonly targetHabitatId: DomainId;
	readonly sourceHabitatIds: readonly DomainId[];
	readonly acknowledgedMergeConsolidatesHistory?: boolean;
}

export type MergeHabitatsCommand = LarvalDomainCommand<
	'larvalSurveillance.mergeHabitats',
	LarvalCommandPayload & {
		readonly targetHabitatId: DomainId;
		readonly sourceHabitatIds: readonly DomainId[];
		readonly acknowledgedMergeConsolidatesHistory: true;
	}
>;

interface InspectionResultCommandInput extends LarvalCommandInput, LarvalInspectionResultInput {
	readonly inspectionId: DomainId;
	readonly inspectionDate: LocalDateString;
	readonly inspectedByProfileId?: DomainId | null;
}

export interface RecordHabitatInspectionCommandInput extends InspectionResultCommandInput {
	readonly habitatId: DomainId;
}

export interface RecordAdHocInspectionCommandInput extends InspectionResultCommandInput {
	readonly featureId: DomainId;
	readonly addressId?: DomainId | null;
	readonly habitatTypeId?: DomainId | null;
}

interface InspectionResultPayload extends LarvalCommandPayload, NormalizedLarvalInspectionResult {
	readonly inspectionId: DomainId;
	readonly inspectionDate: LocalDateString;
	readonly inspectedByProfileId: DomainId;
}

export type RecordHabitatInspectionCommand = LarvalDomainCommand<
	'larvalSurveillance.recordHabitatInspection',
	InspectionResultPayload & { readonly habitatId: DomainId }
>;

export type RecordAdHocInspectionCommand = LarvalDomainCommand<
	'larvalSurveillance.recordAdHocInspection',
	InspectionResultPayload & {
		readonly featureId: DomainId;
		readonly addressId: DomainId | null;
		readonly habitatTypeId: DomainId | null;
	}
>;

export type UpdateInspectionFieldDetailsCommand = LarvalDomainCommand<
	'larvalSurveillance.updateInspectionFieldDetails',
	InspectionResultPayload
>;

export interface UpdateAdHocInspectionLocationCommandInput extends LarvalCommandInput {
	readonly inspectionId: DomainId;
	readonly featureId?: DomainId;
	readonly addressId?: DomainId | null;
	readonly habitatTypeId?: DomainId | null;
}

export type UpdateAdHocInspectionLocationCommand = LarvalDomainCommand<
	'larvalSurveillance.updateAdHocInspectionLocation',
	LarvalCommandPayload & {
		readonly inspectionId: DomainId;
		readonly changes: Readonly<{
			readonly featureId?: DomainId;
			readonly addressId?: DomainId | null;
			readonly habitatTypeId?: DomainId | null;
		}>;
	}
>;

export interface DeleteInspectionCommandInput extends LarvalCommandInput {
	readonly inspectionId: DomainId;
	readonly acknowledgedAssociatedRecordsDeletion?: boolean;
	readonly acknowledgedCrossDomainDetach?: boolean;
}

export type DeleteInspectionCommand = LarvalDomainCommand<
	'larvalSurveillance.deleteInspection',
	LarvalCommandPayload & {
		readonly inspectionId: DomainId;
		readonly acknowledgedAssociatedRecordsDeletion: boolean;
		readonly acknowledgedCrossDomainDetach: boolean;
	}
>;

export interface AddInspectionSampleCommandInput extends LarvalCommandInput {
	readonly sampleId: DomainId;
	readonly inspectionId: DomainId;
	readonly displayName: string;
}

export type AddInspectionSampleCommand = LarvalDomainCommand<
	'larvalSurveillance.addInspectionSample',
	LarvalCommandPayload & {
		readonly sampleId: DomainId;
		readonly inspectionId: DomainId;
		readonly displayName: string;
	}
>;

export interface AddUnlabeledInspectionSampleCommandInput extends LarvalCommandInput {
	readonly sampleId: DomainId;
	readonly inspectionId: DomainId;
}

export type AddUnlabeledInspectionSampleCommand = LarvalDomainCommand<
	'larvalSurveillance.addUnlabeledInspectionSample',
	LarvalCommandPayload & {
		readonly sampleId: DomainId;
		readonly inspectionId: DomainId;
	}
>;

export interface UpdateInspectionSampleCommandInput extends LarvalCommandInput {
	readonly sampleId: DomainId;
	readonly displayName?: string;
}

export type UpdateInspectionSampleCommand = LarvalDomainCommand<
	'larvalSurveillance.updateInspectionSample',
	LarvalCommandPayload & {
		readonly sampleId: DomainId;
		readonly changes: Readonly<{ readonly displayName?: string }>;
	}
>;

export interface DeleteInspectionSampleCommandInput extends LarvalCommandInput {
	readonly sampleId: DomainId;
	readonly acknowledgedAssociatedRecordsDeletion?: boolean;
}

export type DeleteInspectionSampleCommand = LarvalDomainCommand<
	'larvalSurveillance.deleteInspectionSample',
	LarvalCommandPayload & {
		readonly sampleId: DomainId;
		readonly acknowledgedAssociatedRecordsDeletion: boolean;
	}
>;

export interface SampleIdCommandInput extends LarvalCommandInput {
	readonly sampleId: DomainId;
}

export type MarkSampleZeroLarvaeCommand = LarvalDomainCommand<
	'larvalSurveillance.markSampleZeroLarvae',
	LarvalCommandPayload & { readonly sampleId: DomainId }
>;

export type ClearSampleZeroLarvaeCommand = LarvalDomainCommand<
	'larvalSurveillance.clearSampleZeroLarvae',
	LarvalCommandPayload & { readonly sampleId: DomainId }
>;

export interface SetSampleNonMosquitoPresenceCommandInput extends SampleIdCommandInput {
	readonly hasNonMosquito: boolean;
}

export type SetSampleNonMosquitoPresenceCommand = LarvalDomainCommand<
	'larvalSurveillance.setSampleNonMosquitoPresence',
	LarvalCommandPayload & {
		readonly sampleId: DomainId;
		readonly hasNonMosquito: boolean;
	}
>;

export interface SetSampleUnidentifiableReasonCommandInput extends SampleIdCommandInput {
	readonly unidentifiableReason: string | null;
}

export type SetSampleUnidentifiableReasonCommand = LarvalDomainCommand<
	'larvalSurveillance.setSampleUnidentifiableReason',
	LarvalCommandPayload & {
		readonly sampleId: DomainId;
		readonly unidentifiableReason: string | null;
	}
>;

export interface AddSampleSpeciesCountCommandInput extends LarvalCommandInput {
	readonly sampleSpeciesId: DomainId;
	readonly sampleId: DomainId;
	readonly speciesId: DomainId;
	readonly larvaeCount: number;
	readonly identifiedByProfileId?: DomainId | null;
	readonly identifiedAt: LocalDateString;
}

export interface SampleSpeciesCountPayload extends LarvalCommandPayload {
	readonly sampleSpeciesId: DomainId;
	readonly sampleId: DomainId;
	readonly speciesId: DomainId;
	readonly larvaeCount: number;
	readonly identifiedByProfileId: DomainId;
	readonly identifiedAt: LocalDateString;
}

export type AddSampleSpeciesCountCommand = LarvalDomainCommand<
	'larvalSurveillance.addSampleSpeciesCount',
	SampleSpeciesCountPayload
>;

export interface UpdateSampleSpeciesCountCommandInput extends LarvalCommandInput {
	readonly sampleSpeciesId: DomainId;
	readonly speciesId?: DomainId;
	readonly larvaeCount?: number;
	readonly identifiedByProfileId?: DomainId | null;
	readonly identifiedAt?: LocalDateString;
}

export type UpdateSampleSpeciesCountCommand = LarvalDomainCommand<
	'larvalSurveillance.updateSampleSpeciesCount',
	LarvalCommandPayload & {
		readonly sampleSpeciesId: DomainId;
		readonly changes: Readonly<{
			readonly speciesId?: DomainId;
			readonly larvaeCount?: number;
			readonly identifiedByProfileId?: DomainId;
			readonly identifiedAt?: LocalDateString;
		}>;
	}
>;

export interface DeleteSampleSpeciesCountCommandInput extends LarvalCommandInput {
	readonly sampleSpeciesId: DomainId;
}

export type DeleteSampleSpeciesCountCommand = LarvalDomainCommand<
	'larvalSurveillance.deleteSampleSpeciesCount',
	LarvalCommandPayload & { readonly sampleSpeciesId: DomainId }
>;

export type LarvalSurveillanceCommand =
	| CreateHabitatCommand
	| CreateHabitatFromInspectionCommand
	| UpdateHabitatDetailsCommand
	| UpdateHabitatLocationCommand
	| UpdateHabitatConfigurationCommand
	| MarkHabitatInaccessibleCommand
	| ClearHabitatInaccessibleCommand
	| RetireHabitatCommand
	| ReactivateHabitatCommand
	| DeleteHabitatCommand
	| MergeHabitatsCommand
	| RecordHabitatInspectionCommand
	| RecordAdHocInspectionCommand
	| UpdateInspectionFieldDetailsCommand
	| UpdateAdHocInspectionLocationCommand
	| DeleteInspectionCommand
	| AddInspectionSampleCommand
	| AddUnlabeledInspectionSampleCommand
	| UpdateInspectionSampleCommand
	| DeleteInspectionSampleCommand
	| MarkSampleZeroLarvaeCommand
	| ClearSampleZeroLarvaeCommand
	| SetSampleNonMosquitoPresenceCommand
	| SetSampleUnidentifiableReasonCommand
	| AddSampleSpeciesCountCommand
	| UpdateSampleSpeciesCountCommand
	| DeleteSampleSpeciesCountCommand;

const DENSITIES = ['none', 'light', 'medium', 'heavy', 'very_heavy'] as const;
const RANGE_DENSITIES = ['light', 'medium', 'heavy', 'very_heavy'] as const;

export function validateLarvalInspectionEntryPolicy(
	policy: LarvalInspectionEntryPolicy | null | undefined,
): Required<LarvalInspectionEntryPolicy> {
	const issues = createIssues();
	const resolved = resolveLarvalInspectionEntryPolicy(policy, issues, 'policy');
	throwIfIssues('Larval inspection entry policy is invalid.', issues);
	return resolved;
}

export function normalizeLarvalInspectionResult(
	input: LarvalInspectionResultInput,
): NormalizedLarvalInspectionResult {
	const issues = createIssues();
	const result = normalizeInspectionResult(input, 'result', issues);
	throwIfIssues('Larval inspection result is invalid.', issues);
	return result;
}

export function createHabitatCommand(input: CreateHabitatCommandInput): CreateHabitatCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.habitatId, 'habitatId', issues);
	requireUuid(input.featureId, 'featureId', issues);
	const addressId = normalizeOptionalUuid(input.addressId, 'addressId', issues);
	const habitatTypeId = normalizeOptionalUuid(input.habitatTypeId, 'habitatTypeId', issues);
	const description = normalizeRequiredText(input.description, 'description', issues);
	const metadata = normalizeMetadata(input.metadata, 'metadata', issues);
	throwIfIssues('Create habitat command is invalid.', issues);

	return {
		type: 'larvalSurveillance.createHabitat',
		payload: {
			...basePayload(input),
			habitatId: normalizeRequiredId(input.habitatId),
			featureId: normalizeRequiredId(input.featureId),
			addressId,
			habitatTypeId,
			habitatName: normalizeNullableText(input.habitatName),
			description,
			metadata,
		},
	};
}

export function createHabitatFromInspectionCommand(
	input: CreateHabitatFromInspectionCommandInput,
): CreateHabitatFromInspectionCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.habitatId, 'habitatId', issues);
	requireUuid(input.inspectionId, 'inspectionId', issues);
	const description = normalizeRequiredText(input.description, 'description', issues);
	const metadata = normalizeMetadata(input.metadata, 'metadata', issues);
	throwIfIssues('Create habitat from inspection command is invalid.', issues);

	return {
		type: 'larvalSurveillance.createHabitatFromInspection',
		payload: {
			...basePayload(input),
			habitatId: normalizeRequiredId(input.habitatId),
			inspectionId: normalizeRequiredId(input.inspectionId),
			habitatName: normalizeNullableText(input.habitatName),
			description,
			metadata,
		},
	};
}

export function updateHabitatDetailsCommand(
	input: UpdateHabitatDetailsCommandInput,
): UpdateHabitatDetailsCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.habitatId, 'habitatId', issues);
	const hasName = input.habitatName !== undefined;
	const hasDescription = input.description !== undefined;
	const hasMetadata = input.metadata !== undefined;
	if (!hasName && !hasDescription && !hasMetadata) {
		issues.push({ path: 'changes', message: 'At least one habitat detail must change.' });
	}
	const description = hasDescription
		? normalizeRequiredText(input.description, 'description', issues)
		: undefined;
	const metadata = hasMetadata ? normalizeMetadata(input.metadata, 'metadata', issues) : undefined;
	throwIfIssues('Update habitat details command is invalid.', issues);
	const changes: UpdateHabitatDetailsCommand['payload']['changes'] = {
		...(hasName ? { habitatName: normalizeNullableText(input.habitatName) } : {}),
		...(description !== undefined ? { description } : {}),
		...(hasMetadata ? { metadata: metadata ?? null } : {}),
	};

	return {
		type: 'larvalSurveillance.updateHabitatDetails',
		payload: {
			...basePayload(input),
			habitatId: normalizeRequiredId(input.habitatId),
			changes,
		},
	};
}

export function updateHabitatLocationCommand(
	input: UpdateHabitatLocationCommandInput,
): UpdateHabitatLocationCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.habitatId, 'habitatId', issues);
	requireUuid(input.featureId, 'featureId', issues);
	if (input.acknowledgedHabitatLocationSemanticsChange !== true) {
		issues.push({
			path: 'acknowledgedHabitatLocationSemanticsChange',
			message: 'Habitat location changes require acknowledgement.',
		});
	}
	throwIfIssues('Update habitat location command is invalid.', issues);

	return {
		type: 'larvalSurveillance.updateHabitatLocation',
		payload: {
			...basePayload(input),
			habitatId: normalizeRequiredId(input.habitatId),
			featureId: normalizeRequiredId(input.featureId),
			acknowledgedHabitatLocationSemanticsChange: true,
		},
	};
}

export function updateHabitatConfigurationCommand(
	input: UpdateHabitatConfigurationCommandInput,
): UpdateHabitatConfigurationCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.habitatId, 'habitatId', issues);
	const hasAddress = input.addressId !== undefined;
	const hasType = input.habitatTypeId !== undefined;
	if (!hasAddress && !hasType) {
		issues.push({
			path: 'changes',
			message: 'At least one habitat configuration field must change.',
		});
	}
	const addressId = hasAddress
		? normalizeOptionalUuid(input.addressId, 'addressId', issues)
		: undefined;
	const habitatTypeId = hasType
		? normalizeOptionalUuid(input.habitatTypeId, 'habitatTypeId', issues)
		: undefined;
	if (input.acknowledgedHabitatConfigurationSemanticsChange !== true) {
		issues.push({
			path: 'acknowledgedHabitatConfigurationSemanticsChange',
			message: 'Habitat configuration changes require acknowledgement.',
		});
	}
	throwIfIssues('Update habitat configuration command is invalid.', issues);
	const changes: UpdateHabitatConfigurationCommand['payload']['changes'] = {
		...(hasAddress ? { addressId: addressId ?? null } : {}),
		...(hasType ? { habitatTypeId: habitatTypeId ?? null } : {}),
	};

	return {
		type: 'larvalSurveillance.updateHabitatConfiguration',
		payload: {
			...basePayload(input),
			habitatId: normalizeRequiredId(input.habitatId),
			changes,
			acknowledgedHabitatConfigurationSemanticsChange: true,
		},
	};
}

export function markHabitatInaccessibleCommand(
	input: HabitatIdCommandInput,
): MarkHabitatInaccessibleCommand {
	const issues = validateIdCommand(input, 'habitatId');
	throwIfIssues('Mark habitat inaccessible command is invalid.', issues);
	return {
		type: 'larvalSurveillance.markHabitatInaccessible',
		payload: { ...basePayload(input), habitatId: normalizeRequiredId(input.habitatId) },
	};
}

export function clearHabitatInaccessibleCommand(
	input: HabitatIdCommandInput,
): ClearHabitatInaccessibleCommand {
	const issues = validateIdCommand(input, 'habitatId');
	throwIfIssues('Clear habitat inaccessible command is invalid.', issues);
	return {
		type: 'larvalSurveillance.clearHabitatInaccessible',
		payload: { ...basePayload(input), habitatId: normalizeRequiredId(input.habitatId) },
	};
}

export function retireHabitatCommand(input: RetireHabitatCommandInput): RetireHabitatCommand {
	const issues = validateIdCommand(input, 'habitatId');
	throwIfIssues('Retire habitat command is invalid.', issues);
	return {
		type: 'larvalSurveillance.retireHabitat',
		payload: {
			...basePayload(input),
			habitatId: normalizeRequiredId(input.habitatId),
			acknowledgedRouteRemoval: input.acknowledgedRouteRemoval ?? false,
		},
	};
}

export function reactivateHabitatCommand(input: HabitatIdCommandInput): ReactivateHabitatCommand {
	const issues = validateIdCommand(input, 'habitatId');
	throwIfIssues('Reactivate habitat command is invalid.', issues);
	return {
		type: 'larvalSurveillance.reactivateHabitat',
		payload: { ...basePayload(input), habitatId: normalizeRequiredId(input.habitatId) },
	};
}

export function deleteHabitatCommand(input: DeleteHabitatCommandInput): DeleteHabitatCommand {
	const issues = validateIdCommand(input, 'habitatId');
	throwIfIssues('Delete habitat command is invalid.', issues);
	return {
		type: 'larvalSurveillance.deleteHabitat',
		payload: {
			...basePayload(input),
			habitatId: normalizeRequiredId(input.habitatId),
			acknowledgedHabitatDelete: input.acknowledgedHabitatDelete ?? false,
			acknowledgedInspectionDetach: input.acknowledgedInspectionDetach ?? false,
			acknowledgedCrossDomainDetach: input.acknowledgedCrossDomainDetach ?? false,
		},
	};
}

export function mergeHabitatsCommand(input: MergeHabitatsCommandInput): MergeHabitatsCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.targetHabitatId, 'targetHabitatId', issues);
	if (input.sourceHabitatIds.length === 0) {
		issues.push({ path: 'sourceHabitatIds', message: 'At least one source habitat is required.' });
	}
	const normalizedSources = input.sourceHabitatIds.map((id, index) => {
		requireUuid(id, `sourceHabitatIds.${index}`, issues);
		return normalizeRequiredId(id);
	});
	const uniqueSources = new Set(normalizedSources);
	if (uniqueSources.size !== normalizedSources.length) {
		issues.push({ path: 'sourceHabitatIds', message: 'Source habitat IDs must be unique.' });
	}
	if (uniqueSources.has(normalizeRequiredId(input.targetHabitatId))) {
		issues.push({
			path: 'sourceHabitatIds',
			message: 'Source habitat IDs cannot include the target habitat.',
		});
	}
	if (input.acknowledgedMergeConsolidatesHistory !== true) {
		issues.push({
			path: 'acknowledgedMergeConsolidatesHistory',
			message: 'Habitat merge requires acknowledgement.',
		});
	}
	throwIfIssues('Merge habitats command is invalid.', issues);

	return {
		type: 'larvalSurveillance.mergeHabitats',
		payload: {
			...basePayload(input),
			targetHabitatId: normalizeRequiredId(input.targetHabitatId),
			sourceHabitatIds: normalizedSources,
			acknowledgedMergeConsolidatesHistory: true,
		},
	};
}

export function recordHabitatInspectionCommand(
	input: RecordHabitatInspectionCommandInput,
): RecordHabitatInspectionCommand {
	const issues = validateInspectionBase(input);
	requireUuid(input.habitatId, 'habitatId', issues);
	throwIfIssues('Record habitat inspection command is invalid.', issues);

	return {
		type: 'larvalSurveillance.recordHabitatInspection',
		payload: {
			...inspectionPayload(input),
			habitatId: normalizeRequiredId(input.habitatId),
		},
	};
}

export function recordAdHocInspectionCommand(
	input: RecordAdHocInspectionCommandInput,
): RecordAdHocInspectionCommand {
	const issues = validateInspectionBase(input);
	requireUuid(input.featureId, 'featureId', issues);
	const addressId = normalizeOptionalUuid(input.addressId, 'addressId', issues);
	const habitatTypeId = normalizeOptionalUuid(input.habitatTypeId, 'habitatTypeId', issues);
	throwIfIssues('Record ad hoc inspection command is invalid.', issues);

	return {
		type: 'larvalSurveillance.recordAdHocInspection',
		payload: {
			...inspectionPayload(input),
			featureId: normalizeRequiredId(input.featureId),
			addressId,
			habitatTypeId,
		},
	};
}

export function updateInspectionFieldDetailsCommand(
	input: InspectionResultCommandInput,
): UpdateInspectionFieldDetailsCommand {
	const issues = validateInspectionBase(input);
	throwIfIssues('Update inspection field details command is invalid.', issues);

	return {
		type: 'larvalSurveillance.updateInspectionFieldDetails',
		payload: inspectionPayload(input),
	};
}

export function updateAdHocInspectionLocationCommand(
	input: UpdateAdHocInspectionLocationCommandInput,
): UpdateAdHocInspectionLocationCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.inspectionId, 'inspectionId', issues);
	const hasFeature = input.featureId !== undefined;
	const hasAddress = input.addressId !== undefined;
	const hasType = input.habitatTypeId !== undefined;
	if (!hasFeature && !hasAddress && !hasType) {
		issues.push({
			path: 'changes',
			message: 'At least one ad hoc inspection location field must change.',
		});
	}
	if (hasFeature) {
		requireUuid(input.featureId, 'featureId', issues);
	}
	const addressId = hasAddress
		? normalizeOptionalUuid(input.addressId, 'addressId', issues)
		: undefined;
	const habitatTypeId = hasType
		? normalizeOptionalUuid(input.habitatTypeId, 'habitatTypeId', issues)
		: undefined;
	throwIfIssues('Update ad hoc inspection location command is invalid.', issues);
	const changes: UpdateAdHocInspectionLocationCommand['payload']['changes'] = {
		...(hasFeature ? { featureId: normalizeRequiredId(input.featureId) } : {}),
		...(hasAddress ? { addressId: addressId ?? null } : {}),
		...(hasType ? { habitatTypeId: habitatTypeId ?? null } : {}),
	};

	return {
		type: 'larvalSurveillance.updateAdHocInspectionLocation',
		payload: {
			...basePayload(input),
			inspectionId: normalizeRequiredId(input.inspectionId),
			changes,
		},
	};
}

export function deleteInspectionCommand(
	input: DeleteInspectionCommandInput,
): DeleteInspectionCommand {
	const issues = validateIdCommand(input, 'inspectionId');
	throwIfIssues('Delete inspection command is invalid.', issues);
	return {
		type: 'larvalSurveillance.deleteInspection',
		payload: {
			...basePayload(input),
			inspectionId: normalizeRequiredId(input.inspectionId),
			acknowledgedAssociatedRecordsDeletion: input.acknowledgedAssociatedRecordsDeletion ?? false,
			acknowledgedCrossDomainDetach: input.acknowledgedCrossDomainDetach ?? false,
		},
	};
}

export function addInspectionSampleCommand(
	input: AddInspectionSampleCommandInput,
): AddInspectionSampleCommand {
	const issues = validateSampleBase(input);
	const displayName = normalizeRequiredText(input.displayName, 'displayName', issues);
	throwIfIssues('Add inspection sample command is invalid.', issues);
	return {
		type: 'larvalSurveillance.addInspectionSample',
		payload: {
			...basePayload(input),
			sampleId: normalizeRequiredId(input.sampleId),
			inspectionId: normalizeRequiredId(input.inspectionId),
			displayName,
		},
	};
}

export function addUnlabeledInspectionSampleCommand(
	input: AddUnlabeledInspectionSampleCommandInput,
): AddUnlabeledInspectionSampleCommand {
	const issues = validateSampleBase(input);
	throwIfIssues('Add unlabeled inspection sample command is invalid.', issues);
	return {
		type: 'larvalSurveillance.addUnlabeledInspectionSample',
		payload: {
			...basePayload(input),
			sampleId: normalizeRequiredId(input.sampleId),
			inspectionId: normalizeRequiredId(input.inspectionId),
		},
	};
}

export function updateInspectionSampleCommand(
	input: UpdateInspectionSampleCommandInput,
): UpdateInspectionSampleCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.sampleId, 'sampleId', issues);
	const hasDisplayName = input.displayName !== undefined;
	if (!hasDisplayName) {
		issues.push({ path: 'changes', message: 'At least one sample field must change.' });
	}
	const displayName = hasDisplayName
		? normalizeRequiredText(input.displayName, 'displayName', issues)
		: undefined;
	throwIfIssues('Update inspection sample command is invalid.', issues);

	return {
		type: 'larvalSurveillance.updateInspectionSample',
		payload: {
			...basePayload(input),
			sampleId: normalizeRequiredId(input.sampleId),
			changes: {
				...(displayName !== undefined ? { displayName } : {}),
			},
		},
	};
}

export function deleteInspectionSampleCommand(
	input: DeleteInspectionSampleCommandInput,
): DeleteInspectionSampleCommand {
	const issues = validateIdCommand(input, 'sampleId');
	throwIfIssues('Delete inspection sample command is invalid.', issues);
	return {
		type: 'larvalSurveillance.deleteInspectionSample',
		payload: {
			...basePayload(input),
			sampleId: normalizeRequiredId(input.sampleId),
			acknowledgedAssociatedRecordsDeletion: input.acknowledgedAssociatedRecordsDeletion ?? false,
		},
	};
}

export function markSampleZeroLarvaeCommand(
	input: SampleIdCommandInput,
): MarkSampleZeroLarvaeCommand {
	const issues = validateIdCommand(input, 'sampleId');
	throwIfIssues('Mark sample zero larvae command is invalid.', issues);
	return {
		type: 'larvalSurveillance.markSampleZeroLarvae',
		payload: { ...basePayload(input), sampleId: normalizeRequiredId(input.sampleId) },
	};
}

export function clearSampleZeroLarvaeCommand(
	input: SampleIdCommandInput,
): ClearSampleZeroLarvaeCommand {
	const issues = validateIdCommand(input, 'sampleId');
	throwIfIssues('Clear sample zero larvae command is invalid.', issues);
	return {
		type: 'larvalSurveillance.clearSampleZeroLarvae',
		payload: { ...basePayload(input), sampleId: normalizeRequiredId(input.sampleId) },
	};
}

export function setSampleNonMosquitoPresenceCommand(
	input: SetSampleNonMosquitoPresenceCommandInput,
): SetSampleNonMosquitoPresenceCommand {
	const issues = validateIdCommand(input, 'sampleId');
	if (typeof input.hasNonMosquito !== 'boolean') {
		issues.push({ path: 'hasNonMosquito', message: 'hasNonMosquito must be a boolean.' });
	}
	throwIfIssues('Set sample non-mosquito presence command is invalid.', issues);
	return {
		type: 'larvalSurveillance.setSampleNonMosquitoPresence',
		payload: {
			...basePayload(input),
			sampleId: normalizeRequiredId(input.sampleId),
			hasNonMosquito: input.hasNonMosquito,
		},
	};
}

export function setSampleUnidentifiableReasonCommand(
	input: SetSampleUnidentifiableReasonCommandInput,
): SetSampleUnidentifiableReasonCommand {
	const issues = validateIdCommand(input, 'sampleId');
	const unidentifiableReason = normalizeNullableText(input.unidentifiableReason);
	if (input.unidentifiableReason !== null && unidentifiableReason === null) {
		issues.push({
			path: 'unidentifiableReason',
			message: 'unidentifiableReason must be non-empty text or null.',
		});
	}
	throwIfIssues('Set sample unidentifiable reason command is invalid.', issues);
	return {
		type: 'larvalSurveillance.setSampleUnidentifiableReason',
		payload: {
			...basePayload(input),
			sampleId: normalizeRequiredId(input.sampleId),
			unidentifiableReason,
		},
	};
}

export function addSampleSpeciesCountCommand(
	input: AddSampleSpeciesCountCommandInput,
): AddSampleSpeciesCountCommand {
	const issues = validateSampleSpeciesBase(input);
	requireUuid(input.sampleId, 'sampleId', issues);
	requireUuid(input.speciesId, 'speciesId', issues);
	validatePositiveInteger(input.larvaeCount, 'larvaeCount', issues);
	validateLocalDate(input.identifiedAt, 'identifiedAt', issues);
	normalizeOptionalUuid(input.identifiedByProfileId, 'identifiedByProfileId', issues);
	throwIfIssues('Add sample species count command is invalid.', issues);

	return {
		type: 'larvalSurveillance.addSampleSpeciesCount',
		payload: {
			...basePayload(input),
			sampleSpeciesId: normalizeRequiredId(input.sampleSpeciesId),
			sampleId: normalizeRequiredId(input.sampleId),
			speciesId: normalizeRequiredId(input.speciesId),
			larvaeCount: input.larvaeCount,
			identifiedByProfileId: normalizeActorDefaultProfileId(
				input.identifiedByProfileId,
				input.actorProfileId,
			),
			identifiedAt: input.identifiedAt,
		},
	};
}

export function updateSampleSpeciesCountCommand(
	input: UpdateSampleSpeciesCountCommandInput,
): UpdateSampleSpeciesCountCommand {
	const issues = validateSampleSpeciesBase(input);
	const hasSpecies = input.speciesId !== undefined;
	const hasLarvaeCount = input.larvaeCount !== undefined;
	const hasIdentifiedBy = input.identifiedByProfileId !== undefined;
	const hasIdentifiedAt = input.identifiedAt !== undefined;
	if (!hasSpecies && !hasLarvaeCount && !hasIdentifiedBy && !hasIdentifiedAt) {
		issues.push({ path: 'changes', message: 'At least one sample species field must change.' });
	}
	if (hasSpecies) {
		requireUuid(input.speciesId, 'speciesId', issues);
	}
	if (hasLarvaeCount) {
		validatePositiveInteger(input.larvaeCount, 'larvaeCount', issues);
	}
	if (hasIdentifiedAt) {
		validateLocalDate(input.identifiedAt, 'identifiedAt', issues);
	}
	if (hasIdentifiedBy) {
		normalizeOptionalUuid(input.identifiedByProfileId, 'identifiedByProfileId', issues);
	}
	throwIfIssues('Update sample species count command is invalid.', issues);

	return {
		type: 'larvalSurveillance.updateSampleSpeciesCount',
		payload: {
			...basePayload(input),
			sampleSpeciesId: normalizeRequiredId(input.sampleSpeciesId),
			changes: {
				...(hasSpecies ? { speciesId: normalizeRequiredId(input.speciesId) } : {}),
				...(hasLarvaeCount ? { larvaeCount: input.larvaeCount } : {}),
				...(hasIdentifiedBy
					? {
							identifiedByProfileId: normalizeActorDefaultProfileId(
								input.identifiedByProfileId,
								input.actorProfileId,
							),
						}
					: {}),
				...(hasIdentifiedAt ? { identifiedAt: input.identifiedAt } : {}),
			},
		},
	};
}

export function deleteSampleSpeciesCountCommand(
	input: DeleteSampleSpeciesCountCommandInput,
): DeleteSampleSpeciesCountCommand {
	const issues = validateSampleSpeciesBase(input);
	throwIfIssues('Delete sample species count command is invalid.', issues);
	return {
		type: 'larvalSurveillance.deleteSampleSpeciesCount',
		payload: {
			...basePayload(input),
			sampleSpeciesId: normalizeRequiredId(input.sampleSpeciesId),
		},
	};
}

function validateInspectionBase(input: InspectionResultCommandInput): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.inspectionId, 'inspectionId', issues);
	validateLocalDate(input.inspectionDate, 'inspectionDate', issues);
	normalizeOptionalUuid(input.inspectedByProfileId, 'inspectedByProfileId', issues);
	normalizeInspectionResult(input, 'result', issues);
	return issues;
}

function inspectionPayload(input: InspectionResultCommandInput): InspectionResultPayload {
	return {
		...basePayload(input),
		inspectionId: normalizeRequiredId(input.inspectionId),
		inspectionDate: input.inspectionDate,
		inspectedByProfileId: normalizeActorDefaultProfileId(
			input.inspectedByProfileId,
			input.actorProfileId,
		),
		...normalizeLarvalInspectionResult(input),
	};
}

function normalizeInspectionResult(
	input: LarvalInspectionResultInput,
	path: string,
	issues: DomainValidationIssue[],
): NormalizedLarvalInspectionResult {
	const policy = resolveLarvalInspectionEntryPolicy(input.policy, issues, `${path}.policy`);
	if (typeof input.isWet !== 'boolean') {
		issues.push({ path: `${path}.isWet`, message: 'isWet must be a boolean.' });
	}
	const stageFlags = normalizeStageFlags(input);
	const hasAnyStage = Object.values(stageFlags).some(Boolean);
	const dipCount = normalizeOptionalNonnegativeInteger(input.dipCount, `${path}.dipCount`, issues);
	const larvaeCount = normalizeOptionalNonnegativeInteger(
		input.larvaeCount,
		`${path}.larvaeCount`,
		issues,
	);
	if (dipCount !== null && dipCount <= 0) {
		issues.push({ path: `${path}.dipCount`, message: 'dipCount must be a positive integer.' });
	}
	const density = normalizeDensity(input.density, `${path}.density`, issues);

	if (input.isWet === false) {
		if (dipCount !== null || larvaeCount !== null || density !== null || hasAnyStage) {
			issues.push({
				path,
				message: 'Dry inspections cannot include abundance or life-stage fields.',
			});
		}
		return {
			isWet: false,
			dipCount: null,
			density: null,
			larvaeCount: null,
			isBreedingPositive: false,
			...emptyStageFlags(),
		};
	}

	let normalizedDensity = density;
	switch (policy.mode) {
		case 'density_only':
			if (density === null) {
				issues.push({
					path: `${path}.density`,
					message: 'density is required for density-only entry.',
				});
			}
			if (larvaeCount !== null) {
				issues.push({
					path: `${path}.larvaeCount`,
					message: 'larvaeCount is not allowed for density-only entry.',
				});
			}
			break;
		case 'count_and_dips_required':
			if (larvaeCount === null) {
				issues.push({
					path: `${path}.larvaeCount`,
					message: 'larvaeCount is required for count-and-dips entry.',
				});
			}
			if (dipCount === null) {
				issues.push({
					path: `${path}.dipCount`,
					message: 'dipCount is required for count-and-dips entry.',
				});
			}
			break;
		case 'hybrid':
			if (density === null && (larvaeCount === null || dipCount === null)) {
				issues.push({
					path,
					message: 'Wet inspections require density or larvaeCount with dipCount.',
				});
			}
			break;
	}

	if (larvaeCount !== null && dipCount === null) {
		issues.push({
			path: `${path}.dipCount`,
			message: 'dipCount is required when larvaeCount is provided.',
		});
	}

	if (larvaeCount !== null && density !== null) {
		if (density === 'none' && larvaeCount > 0) {
			issues.push({
				path: `${path}.density`,
				message: "density cannot be 'none' when larvaeCount is greater than zero.",
			});
		}
		if (density !== 'none' && larvaeCount === 0) {
			issues.push({
				path: `${path}.density`,
				message: "density must be 'none' when larvaeCount is zero.",
			});
		}
	}

	if (policy.densityRanges !== null && larvaeCount !== null && dipCount !== null) {
		normalizedDensity = inferDensity(larvaeCount, dipCount, policy.densityRanges, path, issues);
		if (density !== null && normalizedDensity !== null && density !== normalizedDensity) {
			issues.push({
				path: `${path}.density`,
				message: 'density must match the configured larvae-per-dip range.',
			});
		}
	}

	const isBreedingPositive =
		normalizedDensity !== null && normalizedDensity !== 'none'
			? true
			: larvaeCount !== null && larvaeCount > 0;

	if (isBreedingPositive && !hasAnyStage) {
		issues.push({
			path,
			message: 'Breeding-positive inspections require at least one life-stage flag.',
		});
	}
	if (!isBreedingPositive && hasAnyStage) {
		issues.push({
			path,
			message: 'Life-stage flags require breeding-positive density or larvaeCount.',
		});
	}

	return {
		isWet: input.isWet,
		dipCount,
		density: normalizedDensity,
		larvaeCount,
		isBreedingPositive,
		...stageFlags,
	};
}

function resolveLarvalInspectionEntryPolicy(
	policy: LarvalInspectionEntryPolicy | null | undefined,
	issues: DomainValidationIssue[],
	path: string,
): Required<LarvalInspectionEntryPolicy> {
	const mode = policy?.mode ?? 'hybrid';
	if (!['density_only', 'count_and_dips_required', 'hybrid'].includes(mode)) {
		issues.push({ path: `${path}.mode`, message: 'Unsupported larval inspection entry mode.' });
	}
	const densityRanges = policy?.densityRanges ?? null;
	if (densityRanges !== null) {
		validateDensityRanges(densityRanges, `${path}.densityRanges`, issues);
	}
	return { mode, densityRanges };
}

function validateDensityRanges(
	ranges: LarvalDensityRanges,
	path: string,
	issues: DomainValidationIssue[],
): void {
	let previousMax: number | null = null;
	for (const density of RANGE_DENSITIES) {
		const range = ranges[density === 'very_heavy' ? 'veryHeavy' : density];
		if (range === undefined) {
			issues.push({ path: `${path}.${density}`, message: `${density} range is required.` });
			continue;
		}
		if (!Number.isFinite(range.minInclusive) || range.minInclusive < 0) {
			issues.push({
				path: `${path}.${density}.minInclusive`,
				message: 'minInclusive must be a finite number greater than or equal to zero.',
			});
		}
		const maxExclusive = range.maxExclusive ?? null;
		if (
			maxExclusive !== null &&
			(!Number.isFinite(maxExclusive) || maxExclusive <= range.minInclusive)
		) {
			issues.push({
				path: `${path}.${density}.maxExclusive`,
				message: 'maxExclusive must be greater than minInclusive when present.',
			});
		}
		if (previousMax === null && range.minInclusive !== 0) {
			issues.push({
				path: `${path}.${density}.minInclusive`,
				message: 'The first density range must start at zero.',
			});
		}
		if (previousMax !== null && range.minInclusive !== previousMax) {
			issues.push({
				path: `${path}.${density}.minInclusive`,
				message: 'Density ranges must be contiguous.',
			});
		}
		previousMax = maxExclusive;
	}
	if (ranges.veryHeavy.maxExclusive !== undefined && ranges.veryHeavy.maxExclusive !== null) {
		issues.push({
			path: `${path}.very_heavy.maxExclusive`,
			message: 'The very_heavy range must be open-ended.',
		});
	}
}

function inferDensity(
	larvaeCount: number,
	dipCount: number,
	ranges: LarvalDensityRanges,
	path: string,
	issues: DomainValidationIssue[],
): LarvalDensity | null {
	if (larvaeCount === 0) {
		return 'none';
	}
	const rate = larvaeCount / dipCount;
	for (const density of RANGE_DENSITIES) {
		const range = ranges[density === 'very_heavy' ? 'veryHeavy' : density];
		if (
			rate >= range.minInclusive &&
			(range.maxExclusive === undefined || range.maxExclusive === null || rate < range.maxExclusive)
		) {
			return density;
		}
	}
	issues.push({ path, message: 'Configured density ranges did not match larvae per dip.' });
	return null;
}

function validateBase(input: LarvalCommandInput, issues: DomainValidationIssue[]): void {
	requireUuid(input.organizationId, 'organizationId', issues);
	requireUuid(input.actorProfileId, 'actorProfileId', issues);
}

function validateIdCommand<T extends LarvalCommandInput>(
	input: T,
	idKey: keyof T & string,
): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input[idKey] as string | undefined, idKey, issues);
	return issues;
}

function validateSampleBase(
	input: AddInspectionSampleCommandInput | AddUnlabeledInspectionSampleCommandInput,
): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.sampleId, 'sampleId', issues);
	requireUuid(input.inspectionId, 'inspectionId', issues);
	return issues;
}

function validateSampleSpeciesBase(
	input:
		| AddSampleSpeciesCountCommandInput
		| UpdateSampleSpeciesCountCommandInput
		| DeleteSampleSpeciesCountCommandInput,
): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.sampleSpeciesId, 'sampleSpeciesId', issues);
	return issues;
}

function validatePositiveInteger(
	value: number | undefined,
	path: string,
	issues: DomainValidationIssue[],
): void {
	if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
		issues.push({ path, message: `${path} must be a positive integer.` });
	}
}

function validateLocalDate(
	value: LocalDateString | undefined,
	path: string,
	issues: DomainValidationIssue[],
): void {
	if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		issues.push({ path, message: `${path} must be a YYYY-MM-DD date string.` });
		return;
	}
	const parsed = new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
		issues.push({ path, message: `${path} must be a valid calendar date.` });
		return;
	}
	const today = new Date().toISOString().slice(0, 10);
	if (value > today) {
		issues.push({ path, message: `${path} cannot be in the future.` });
	}
}

function requireUuid(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): void {
	const normalized = normalizeOptionalId(value);
	if (normalized === null) {
		issues.push({ path, message: `${path} is required.` });
		return;
	}
	if (!isUuid(normalized)) {
		issues.push({ path, message: `${path} must be a UUID.` });
	}
}

function normalizeRequiredId(value: string | null | undefined): string {
	return normalizeOptionalId(value) ?? '';
}

function normalizeActorDefaultProfileId(
	value: string | null | undefined,
	actorProfileId: string,
): string {
	return normalizeOptionalId(value) ?? normalizeRequiredId(actorProfileId);
}

function normalizeOptionalUuid(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): string | null {
	const normalized = normalizeOptionalId(value);
	if (normalized !== null && !isUuid(normalized)) {
		issues.push({ path, message: `${path} must be a UUID.` });
	}
	return normalized;
}

function normalizeOptionalId(value: string | null | undefined): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function normalizeRequiredText(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): string {
	const normalized = normalizeNullableText(value);
	if (normalized === null) {
		issues.push({ path, message: `${path} is required.` });
		return '';
	}
	return normalized;
}

function normalizeNullableText(value: string | null | undefined): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function normalizeMetadata(
	value: unknown | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): JsonObject | null {
	if (value === undefined || value === null) {
		return null;
	}
	if (typeof value !== 'object' || Array.isArray(value)) {
		issues.push({ path, message: `${path} must be a JSON object or null.` });
		return null;
	}
	return value as JsonObject;
}

function normalizeOptionalNonnegativeInteger(
	value: number | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): number | null {
	if (value === undefined || value === null) {
		return null;
	}
	if (!Number.isInteger(value) || value < 0) {
		issues.push({ path, message: `${path} must be a nonnegative integer.` });
		return null;
	}
	return value;
}

function normalizeDensity(
	value: LarvalDensity | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): LarvalDensity | null {
	if (value === undefined || value === null) {
		return null;
	}
	if (!DENSITIES.includes(value)) {
		issues.push({ path, message: `${path} is not a supported larval density.` });
		return null;
	}
	return value;
}

function normalizeStageFlags(input: Partial<ImmatureStageFlags>): ImmatureStageFlags {
	return {
		hasFirstInstar: input.hasFirstInstar ?? false,
		hasSecondInstar: input.hasSecondInstar ?? false,
		hasThirdInstar: input.hasThirdInstar ?? false,
		hasFourthInstar: input.hasFourthInstar ?? false,
		hasPupae: input.hasPupae ?? false,
		hasEggs: input.hasEggs ?? false,
	};
}

function emptyStageFlags(): ImmatureStageFlags {
	return {
		hasFirstInstar: false,
		hasSecondInstar: false,
		hasThirdInstar: false,
		hasFourthInstar: false,
		hasPupae: false,
		hasEggs: false,
	};
}

function basePayload(input: LarvalCommandInput): LarvalCommandPayload {
	return {
		organizationId: normalizeRequiredId(input.organizationId),
		actorProfileId: normalizeRequiredId(input.actorProfileId),
	};
}

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function createIssues(): DomainValidationIssue[] {
	return [];
}

function throwIfIssues(message: string, issues: readonly DomainValidationIssue[]): void {
	if (issues.length > 0) {
		throw new DomainValidationError(message, issues);
	}
}
