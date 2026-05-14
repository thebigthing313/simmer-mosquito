import {
	createIssues,
	actorDefaultProfileId as normalizeActorDefaultProfileId,
	jsonObject as normalizeMetadata,
	optionalUuid as normalizeOptionalUuid,
	requiredId as normalizeRequiredId,
	requiredUuid as requireUuid,
	throwIfIssues,
	validateAgencyCommandContext,
} from '../command-validation.js';
import {
	type AdultCollectionLocationSource,
	type AdultCollectionLocationSourceInput,
	type TrapLocationSource,
	type TrapLocationSourceInput,
	validateAdultCollectionLocationSource,
	validateTrapLocationSource,
} from '../location-intent.js';
import type { DomainId, DomainValidationIssue, JsonObject, LocalDateString } from '../shared.js';

export {
	type DomainId,
	DomainValidationError,
	type DomainValidationIssue,
	type GeoJsonPoint,
	type JsonObject,
	type LocalDateString,
} from '../shared.js';

export type AdultSurveillanceCommandType =
	| 'adultSurveillance.createTrap'
	| 'adultSurveillance.updateTrapDetails'
	| 'adultSurveillance.updateTrapConfiguration'
	| 'adultSurveillance.retireTrap'
	| 'adultSurveillance.reactivateTrap'
	| 'adultSurveillance.deleteTrap'
	| 'adultSurveillance.setTrapCollection'
	| 'adultSurveillance.setAdHocCollection'
	| 'adultSurveillance.recordCollectedTrapCollection'
	| 'adultSurveillance.recordCollectedAdHocCollection'
	| 'adultSurveillance.collectCollection'
	| 'adultSurveillance.cancelPendingCollection'
	| 'adultSurveillance.updateCollectionFieldDetails'
	| 'adultSurveillance.updateAdHocCollectionConfiguration'
	| 'adultSurveillance.deleteCollection'
	| 'adultSurveillance.addCollectionSpeciesCount'
	| 'adultSurveillance.updateCollectionSpeciesCount'
	| 'adultSurveillance.deleteCollectionSpeciesCount'
	| 'adultSurveillance.markCollectionZeroResult'
	| 'adultSurveillance.clearCollectionZeroResult'
	| 'adultSurveillance.setCollectionBycatch';

export type CollectionTimingMode = 'exact_timestamps' | 'collection_date_duration';
export type CollectionSpeciesSex = 'male' | 'female';
export type CollectionSpeciesStatus = 'damaged' | 'unfed' | 'bloodfed' | 'gravid';

export interface DomainCommand<TType extends AdultSurveillanceCommandType, TPayload> {
	readonly type: TType;
	readonly payload: TPayload;
}

interface AdultCommandInput {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

interface AdultCommandPayload {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export interface ExactPendingCollectionTiming {
	readonly mode: 'exact_timestamps';
	readonly startedAt: Date;
}

export interface ExactCollectedCollectionTiming {
	readonly mode: 'exact_timestamps';
	readonly startedAt: Date;
	readonly collectedAt: Date;
}

export interface DateDurationCollectionTiming {
	readonly mode: 'collection_date_duration';
	readonly collectionDate: LocalDateString;
	readonly durationAmount: number;
	readonly durationUnitId: DomainId;
}

export type CollectionTiming =
	| ExactPendingCollectionTiming
	| ExactCollectedCollectionTiming
	| DateDurationCollectionTiming;

export type CollectedCollectionTiming =
	| ExactCollectedCollectionTiming
	| DateDurationCollectionTiming;

export interface CreateTrapCommandInput extends AdultCommandInput {
	readonly trapId: DomainId;
	readonly locationSource: TrapLocationSourceInput;
	readonly collectionMethodId: DomainId;
	readonly addressId?: DomainId | null;
	readonly collectionLureId?: DomainId | null;
	readonly trapName?: string | null;
	readonly trapCode?: string | null;
	readonly description?: string | null;
	readonly acknowledgedDuplicateTrapCode?: boolean;
}

export interface CreateTrapCommandPayload extends AdultCommandPayload {
	readonly trapId: DomainId;
	readonly locationSource: TrapLocationSource;
	readonly collectionMethodId: DomainId;
	readonly addressId: DomainId | null;
	readonly collectionLureId: DomainId | null;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	readonly description: string | null;
	readonly acknowledgedDuplicateTrapCode: boolean;
}

export type CreateTrapCommand = DomainCommand<
	'adultSurveillance.createTrap',
	CreateTrapCommandPayload
>;

export interface UpdateTrapDetailsCommandInput extends AdultCommandInput {
	readonly trapId: DomainId;
	readonly trapName?: string | null;
	readonly trapCode?: string | null;
	readonly description?: string | null;
	readonly acknowledgedHistoricalLabelChange?: boolean;
}

export interface UpdateTrapDetailsCommandPayload extends AdultCommandPayload {
	readonly trapId: DomainId;
	readonly changes: Readonly<{
		readonly trapName?: string | null;
		readonly trapCode?: string | null;
		readonly description?: string | null;
	}>;
	readonly acknowledgedHistoricalLabelChange: boolean;
}

export type UpdateTrapDetailsCommand = DomainCommand<
	'adultSurveillance.updateTrapDetails',
	UpdateTrapDetailsCommandPayload
>;

export interface UpdateTrapConfigurationCommandInput extends AdultCommandInput {
	readonly trapId: DomainId;
	readonly locationSource?: TrapLocationSourceInput;
	readonly collectionMethodId?: DomainId;
	readonly addressId?: DomainId | null;
	readonly collectionLureId?: DomainId | null;
	readonly acknowledgedTrapLocationSemanticsChange?: boolean;
	readonly acknowledgedTrapMethodSemanticsChange?: boolean;
}

export interface UpdateTrapConfigurationCommandPayload extends AdultCommandPayload {
	readonly trapId: DomainId;
	readonly changes: Readonly<{
		readonly locationSource?: TrapLocationSource;
		readonly collectionMethodId?: DomainId;
		readonly addressId?: DomainId | null;
		readonly collectionLureId?: DomainId | null;
	}>;
	readonly acknowledgedTrapLocationSemanticsChange: boolean;
	readonly acknowledgedTrapMethodSemanticsChange: boolean;
}

export type UpdateTrapConfigurationCommand = DomainCommand<
	'adultSurveillance.updateTrapConfiguration',
	UpdateTrapConfigurationCommandPayload
>;

export interface RetireTrapCommandInput extends AdultCommandInput {
	readonly trapId: DomainId;
}

export type RetireTrapCommand = DomainCommand<
	'adultSurveillance.retireTrap',
	AdultCommandPayload & { readonly trapId: DomainId }
>;

export interface ReactivateTrapCommandInput extends AdultCommandInput {
	readonly trapId: DomainId;
	readonly acknowledgedDuplicateTrapCode?: boolean;
}

export type ReactivateTrapCommand = DomainCommand<
	'adultSurveillance.reactivateTrap',
	AdultCommandPayload & {
		readonly trapId: DomainId;
		readonly acknowledgedDuplicateTrapCode: boolean;
	}
>;

export interface DeleteTrapCommandInput extends AdultCommandInput {
	readonly trapId: DomainId;
	readonly acknowledgedCascadeDelete?: boolean;
}

export type DeleteTrapCommand = DomainCommand<
	'adultSurveillance.deleteTrap',
	AdultCommandPayload & {
		readonly trapId: DomainId;
		readonly acknowledgedCascadeDelete: boolean;
	}
>;

interface CollectionBaseInput extends AdultCommandInput {
	readonly collectionId: DomainId;
	readonly metadata?: unknown | null;
}

interface CollectionBasePayload extends AdultCommandPayload {
	readonly collectionId: DomainId;
	readonly metadata: JsonObject | null;
}

export interface SetTrapCollectionCommandInput extends CollectionBaseInput {
	readonly trapId: DomainId;
	readonly startedAt: Date;
	readonly setByProfileId?: DomainId | null;
}

export interface SetTrapCollectionCommandPayload extends CollectionBasePayload {
	readonly trapId: DomainId;
	readonly timing: ExactPendingCollectionTiming;
	readonly setByProfileId: DomainId;
}

export type SetTrapCollectionCommand = DomainCommand<
	'adultSurveillance.setTrapCollection',
	SetTrapCollectionCommandPayload
>;

export interface SetAdHocCollectionCommandInput extends CollectionBaseInput {
	readonly collectionMethodId: DomainId;
	readonly locationSource: AdultCollectionLocationSourceInput;
	readonly collectionLureId?: DomainId | null;
	readonly addressId?: DomainId | null;
	readonly startedAt: Date;
	readonly setByProfileId?: DomainId | null;
}

export interface SetAdHocCollectionCommandPayload extends CollectionBasePayload {
	readonly collectionMethodId: DomainId;
	readonly locationSource: AdultCollectionLocationSource;
	readonly collectionLureId: DomainId | null;
	readonly addressId: DomainId | null;
	readonly timing: ExactPendingCollectionTiming;
	readonly setByProfileId: DomainId;
}

export type SetAdHocCollectionCommand = DomainCommand<
	'adultSurveillance.setAdHocCollection',
	SetAdHocCollectionCommandPayload
>;

export interface RecordCollectedTrapCollectionCommandInput extends CollectionBaseInput {
	readonly trapId: DomainId;
	readonly timing: CollectedCollectionTiming;
	readonly setByProfileId?: DomainId | null;
	readonly collectedByProfileId?: DomainId | null;
	readonly hasProblem?: boolean;
	readonly acknowledgedPendingTrapCollection?: boolean;
}

export interface RecordCollectedTrapCollectionCommandPayload extends CollectionBasePayload {
	readonly trapId: DomainId;
	readonly timing: CollectedCollectionTiming;
	readonly setByProfileId: DomainId | null;
	readonly collectedByProfileId: DomainId;
	readonly hasProblem: boolean;
	readonly acknowledgedPendingTrapCollection: boolean;
}

export type RecordCollectedTrapCollectionCommand = DomainCommand<
	'adultSurveillance.recordCollectedTrapCollection',
	RecordCollectedTrapCollectionCommandPayload
>;

export interface RecordCollectedAdHocCollectionCommandInput extends CollectionBaseInput {
	readonly collectionMethodId: DomainId;
	readonly locationSource: AdultCollectionLocationSourceInput;
	readonly collectionLureId?: DomainId | null;
	readonly addressId?: DomainId | null;
	readonly timing: CollectedCollectionTiming;
	readonly setByProfileId?: DomainId | null;
	readonly collectedByProfileId?: DomainId | null;
	readonly hasProblem?: boolean;
}

export interface RecordCollectedAdHocCollectionCommandPayload extends CollectionBasePayload {
	readonly collectionMethodId: DomainId;
	readonly locationSource: AdultCollectionLocationSource;
	readonly collectionLureId: DomainId | null;
	readonly addressId: DomainId | null;
	readonly timing: CollectedCollectionTiming;
	readonly setByProfileId: DomainId | null;
	readonly collectedByProfileId: DomainId;
	readonly hasProblem: boolean;
}

export type RecordCollectedAdHocCollectionCommand = DomainCommand<
	'adultSurveillance.recordCollectedAdHocCollection',
	RecordCollectedAdHocCollectionCommandPayload
>;

export interface CollectCollectionCommandInput extends AdultCommandInput {
	readonly collectionId: DomainId;
	readonly collectedAt: Date;
	readonly collectedByProfileId?: DomainId | null;
	readonly hasProblem?: boolean;
	readonly metadata?: unknown | null;
}

export interface CollectCollectionCommandPayload extends CollectionBasePayload {
	readonly collectedAt: Date;
	readonly collectedByProfileId: DomainId;
	readonly hasProblem: boolean;
}

export type CollectCollectionCommand = DomainCommand<
	'adultSurveillance.collectCollection',
	CollectCollectionCommandPayload
>;

export interface CancelPendingCollectionCommandInput extends AdultCommandInput {
	readonly collectionId: DomainId;
}

export type CancelPendingCollectionCommand = DomainCommand<
	'adultSurveillance.cancelPendingCollection',
	AdultCommandPayload & { readonly collectionId: DomainId }
>;

export interface UpdateCollectionFieldDetailsCommandInput extends CollectionBaseInput {
	readonly timing?: CollectionTiming;
	readonly setByProfileId?: DomainId | null;
	readonly collectedByProfileId?: DomainId | null;
	readonly hasProblem?: boolean;
}

export interface UpdateCollectionFieldDetailsCommandPayload extends CollectionBasePayload {
	readonly changes: Readonly<{
		readonly timing?: CollectionTiming;
		readonly setByProfileId?: DomainId | null;
		readonly collectedByProfileId?: DomainId | null;
		readonly hasProblem?: boolean;
	}>;
}

export type UpdateCollectionFieldDetailsCommand = DomainCommand<
	'adultSurveillance.updateCollectionFieldDetails',
	UpdateCollectionFieldDetailsCommandPayload
>;

export interface UpdateAdHocCollectionConfigurationCommandInput extends AdultCommandInput {
	readonly collectionId: DomainId;
	readonly collectionMethodId?: DomainId;
	readonly locationSource?: AdultCollectionLocationSourceInput;
	readonly collectionLureId?: DomainId | null;
	readonly addressId?: DomainId | null;
}

export interface UpdateAdHocCollectionConfigurationCommandPayload extends AdultCommandPayload {
	readonly collectionId: DomainId;
	readonly changes: Readonly<{
		readonly collectionMethodId?: DomainId;
		readonly locationSource?: AdultCollectionLocationSource;
		readonly collectionLureId?: DomainId | null;
		readonly addressId?: DomainId | null;
	}>;
}

export type UpdateAdHocCollectionConfigurationCommand = DomainCommand<
	'adultSurveillance.updateAdHocCollectionConfiguration',
	UpdateAdHocCollectionConfigurationCommandPayload
>;

export interface DeleteCollectionCommandInput extends AdultCommandInput {
	readonly collectionId: DomainId;
	readonly acknowledgedSpeciesCountDeletion?: boolean;
}

export type DeleteCollectionCommand = DomainCommand<
	'adultSurveillance.deleteCollection',
	AdultCommandPayload & {
		readonly collectionId: DomainId;
		readonly acknowledgedSpeciesCountDeletion: boolean;
	}
>;

export interface AddCollectionSpeciesCountCommandInput extends AdultCommandInput {
	readonly collectionSpeciesId: DomainId;
	readonly collectionId: DomainId;
	readonly speciesId: DomainId;
	readonly count: number;
	readonly sex?: CollectionSpeciesSex | null;
	readonly status?: CollectionSpeciesStatus | null;
	readonly identifiedByProfileId?: DomainId | null;
	readonly identifiedDate: LocalDateString;
}

export interface CollectionSpeciesCountPayload extends AdultCommandPayload {
	readonly collectionSpeciesId: DomainId;
	readonly collectionId: DomainId;
	readonly speciesId: DomainId;
	readonly count: number;
	readonly sex: CollectionSpeciesSex | null;
	readonly status: CollectionSpeciesStatus | null;
	readonly identifiedByProfileId: DomainId;
	readonly identifiedDate: LocalDateString;
}

export type AddCollectionSpeciesCountCommand = DomainCommand<
	'adultSurveillance.addCollectionSpeciesCount',
	CollectionSpeciesCountPayload
>;

export interface UpdateCollectionSpeciesCountCommandInput extends AdultCommandInput {
	readonly collectionSpeciesId: DomainId;
	readonly count?: number;
	readonly speciesId?: DomainId;
	readonly sex?: CollectionSpeciesSex | null;
	readonly status?: CollectionSpeciesStatus | null;
	readonly identifiedByProfileId?: DomainId | null;
	readonly identifiedDate?: LocalDateString;
}

export interface UpdateCollectionSpeciesCountCommandPayload extends AdultCommandPayload {
	readonly collectionSpeciesId: DomainId;
	readonly changes: Readonly<{
		readonly count?: number;
		readonly speciesId?: DomainId;
		readonly sex?: CollectionSpeciesSex | null;
		readonly status?: CollectionSpeciesStatus | null;
		readonly identifiedByProfileId?: DomainId;
		readonly identifiedDate?: LocalDateString;
	}>;
}

export type UpdateCollectionSpeciesCountCommand = DomainCommand<
	'adultSurveillance.updateCollectionSpeciesCount',
	UpdateCollectionSpeciesCountCommandPayload
>;

export interface DeleteCollectionSpeciesCountCommandInput extends AdultCommandInput {
	readonly collectionSpeciesId: DomainId;
}

export type DeleteCollectionSpeciesCountCommand = DomainCommand<
	'adultSurveillance.deleteCollectionSpeciesCount',
	AdultCommandPayload & { readonly collectionSpeciesId: DomainId }
>;

export interface MarkCollectionZeroResultCommandInput extends AdultCommandInput {
	readonly collectionId: DomainId;
	readonly acknowledgedSpeciesCountsClearance?: boolean;
}

export type MarkCollectionZeroResultCommand = DomainCommand<
	'adultSurveillance.markCollectionZeroResult',
	AdultCommandPayload & {
		readonly collectionId: DomainId;
		readonly acknowledgedSpeciesCountsClearance: boolean;
	}
>;

export interface ClearCollectionZeroResultCommandInput extends AdultCommandInput {
	readonly collectionId: DomainId;
}

export type ClearCollectionZeroResultCommand = DomainCommand<
	'adultSurveillance.clearCollectionZeroResult',
	AdultCommandPayload & { readonly collectionId: DomainId }
>;

export interface SetCollectionBycatchCommandInput extends AdultCommandInput {
	readonly collectionId: DomainId;
	readonly hasBycatch: boolean;
}

export type SetCollectionBycatchCommand = DomainCommand<
	'adultSurveillance.setCollectionBycatch',
	AdultCommandPayload & {
		readonly collectionId: DomainId;
		readonly hasBycatch: boolean;
	}
>;

export type AdultSurveillanceCommand =
	| CreateTrapCommand
	| UpdateTrapDetailsCommand
	| UpdateTrapConfigurationCommand
	| RetireTrapCommand
	| ReactivateTrapCommand
	| DeleteTrapCommand
	| SetTrapCollectionCommand
	| SetAdHocCollectionCommand
	| RecordCollectedTrapCollectionCommand
	| RecordCollectedAdHocCollectionCommand
	| CollectCollectionCommand
	| CancelPendingCollectionCommand
	| UpdateCollectionFieldDetailsCommand
	| UpdateAdHocCollectionConfigurationCommand
	| DeleteCollectionCommand
	| AddCollectionSpeciesCountCommand
	| UpdateCollectionSpeciesCountCommand
	| DeleteCollectionSpeciesCountCommand
	| MarkCollectionZeroResultCommand
	| ClearCollectionZeroResultCommand
	| SetCollectionBycatchCommand;

export interface TrapNightRateInput {
	readonly mosquitoCount: number;
	readonly trapNights: number;
}

export interface EstimateStartedAtFromTrapNightsInput {
	readonly collectedAt: Date;
	readonly trapNights: number;
}

export function createTrapCommand(input: CreateTrapCommandInput): CreateTrapCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.trapId, 'trapId', issues);
	const locationSource = validateTrapLocationSourceInput(input, issues);
	requireUuid(input.collectionMethodId, 'collectionMethodId', issues);

	const trapName = normalizeNullableText(input.trapName);
	const trapCode = normalizeNullableText(input.trapCode);
	const addressId = normalizeOptionalUuid(input.addressId, 'addressId', issues);
	const collectionLureId = normalizeOptionalUuid(
		input.collectionLureId,
		'collectionLureId',
		issues,
	);
	validateTrapDisplay(trapName, trapCode, issues);
	throwIfIssues('Create trap command is invalid.', issues);

	return {
		type: 'adultSurveillance.createTrap',
		payload: {
			organizationId: normalizeRequiredId(input.organizationId),
			actorProfileId: normalizeRequiredId(input.actorProfileId),
			trapId: normalizeRequiredId(input.trapId),
			locationSource,
			collectionMethodId: normalizeRequiredId(input.collectionMethodId),
			addressId,
			collectionLureId,
			trapName,
			trapCode,
			description: normalizeNullableText(input.description),
			acknowledgedDuplicateTrapCode: input.acknowledgedDuplicateTrapCode ?? false,
		},
	};
}

export function updateTrapDetailsCommand(
	input: UpdateTrapDetailsCommandInput,
): UpdateTrapDetailsCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.trapId, 'trapId', issues);
	const hasTrapName = input.trapName !== undefined;
	const hasTrapCode = input.trapCode !== undefined;
	const hasDescription = input.description !== undefined;
	if (!hasTrapName && !hasTrapCode && !hasDescription) {
		issues.push({ path: 'changes', message: 'At least one trap detail must change.' });
	}
	if (hasTrapName && hasTrapCode) {
		validateTrapDisplay(
			normalizeNullableText(input.trapName),
			normalizeNullableText(input.trapCode),
			issues,
		);
	}
	throwIfIssues('Update trap details command is invalid.', issues);

	return {
		type: 'adultSurveillance.updateTrapDetails',
		payload: {
			...basePayload(input),
			trapId: normalizeRequiredId(input.trapId),
			changes: {
				...(hasTrapName ? { trapName: normalizeNullableText(input.trapName) } : {}),
				...(hasTrapCode ? { trapCode: normalizeNullableText(input.trapCode) } : {}),
				...(hasDescription ? { description: normalizeNullableText(input.description) } : {}),
			},
			acknowledgedHistoricalLabelChange: input.acknowledgedHistoricalLabelChange ?? false,
		},
	};
}

export function updateTrapConfigurationCommand(
	input: UpdateTrapConfigurationCommandInput,
): UpdateTrapConfigurationCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.trapId, 'trapId', issues);
	const hasLocation = input.locationSource !== undefined;
	const hasMethod = input.collectionMethodId !== undefined;
	const hasAddress = input.addressId !== undefined;
	const hasLure = input.collectionLureId !== undefined;
	if (!hasLocation && !hasMethod && !hasAddress && !hasLure) {
		issues.push({ path: 'changes', message: 'At least one trap configuration field must change.' });
	}
	const locationSource = hasLocation ? validateTrapLocationSourceInput(input, issues) : undefined;
	if (hasLocation) {
		if (input.acknowledgedTrapLocationSemanticsChange !== true) {
			issues.push({
				path: 'acknowledgedTrapLocationSemanticsChange',
				message: 'Changing trap location requires semantic-change acknowledgement.',
			});
		}
	}
	if (hasMethod) {
		requireUuid(input.collectionMethodId, 'collectionMethodId', issues);
		if (input.acknowledgedTrapMethodSemanticsChange !== true) {
			issues.push({
				path: 'acknowledgedTrapMethodSemanticsChange',
				message: 'Changing trap method requires semantic-change acknowledgement.',
			});
		}
	}
	throwIfIssues('Update trap configuration command is invalid.', issues);

	return {
		type: 'adultSurveillance.updateTrapConfiguration',
		payload: {
			...basePayload(input),
			trapId: normalizeRequiredId(input.trapId),
			changes: {
				...(locationSource !== undefined ? { locationSource } : {}),
				...(hasMethod ? { collectionMethodId: normalizeRequiredId(input.collectionMethodId) } : {}),
				...(hasAddress
					? { addressId: normalizeOptionalUuid(input.addressId, 'addressId', issues) }
					: {}),
				...(hasLure
					? {
							collectionLureId: normalizeOptionalUuid(
								input.collectionLureId,
								'collectionLureId',
								issues,
							),
						}
					: {}),
			},
			acknowledgedTrapLocationSemanticsChange:
				input.acknowledgedTrapLocationSemanticsChange ?? false,
			acknowledgedTrapMethodSemanticsChange: input.acknowledgedTrapMethodSemanticsChange ?? false,
		},
	};
}

export function retireTrapCommand(input: RetireTrapCommandInput): RetireTrapCommand {
	const issues = validateIdCommand(input, 'trapId');
	throwIfIssues('Retire trap command is invalid.', issues);
	return {
		type: 'adultSurveillance.retireTrap',
		payload: { ...basePayload(input), trapId: normalizeRequiredId(input.trapId) },
	};
}

export function reactivateTrapCommand(input: ReactivateTrapCommandInput): ReactivateTrapCommand {
	const issues = validateIdCommand(input, 'trapId');
	throwIfIssues('Reactivate trap command is invalid.', issues);
	return {
		type: 'adultSurveillance.reactivateTrap',
		payload: {
			...basePayload(input),
			trapId: normalizeRequiredId(input.trapId),
			acknowledgedDuplicateTrapCode: input.acknowledgedDuplicateTrapCode ?? false,
		},
	};
}

export function deleteTrapCommand(input: DeleteTrapCommandInput): DeleteTrapCommand {
	const issues = validateIdCommand(input, 'trapId');
	throwIfIssues('Delete trap command is invalid.', issues);
	return {
		type: 'adultSurveillance.deleteTrap',
		payload: {
			...basePayload(input),
			trapId: normalizeRequiredId(input.trapId),
			acknowledgedCascadeDelete: input.acknowledgedCascadeDelete ?? false,
		},
	};
}

export function setTrapCollectionCommand(
	input: SetTrapCollectionCommandInput,
): SetTrapCollectionCommand {
	const issues = validateCollectionBase(input);
	requireUuid(input.trapId, 'trapId', issues);
	validateOperationalDate(input.startedAt, 'startedAt', issues);
	throwIfIssues('Set trap collection command is invalid.', issues);

	return {
		type: 'adultSurveillance.setTrapCollection',
		payload: {
			...collectionBasePayload(input),
			trapId: normalizeRequiredId(input.trapId),
			timing: { mode: 'exact_timestamps', startedAt: input.startedAt },
			setByProfileId: normalizeActorDefaultProfileId(input.setByProfileId, input.actorProfileId),
		},
	};
}

export function setAdHocCollectionCommand(
	input: SetAdHocCollectionCommandInput,
): SetAdHocCollectionCommand {
	const issues = validateCollectionBase(input);
	requireUuid(input.collectionMethodId, 'collectionMethodId', issues);
	const locationSource = validateAdultCollectionLocationSourceInput(input, issues);
	validateOperationalDate(input.startedAt, 'startedAt', issues);
	throwIfIssues('Set ad hoc collection command is invalid.', issues);

	return {
		type: 'adultSurveillance.setAdHocCollection',
		payload: {
			...collectionBasePayload(input),
			collectionMethodId: normalizeRequiredId(input.collectionMethodId),
			locationSource,
			collectionLureId: normalizeOptionalUuid(input.collectionLureId, 'collectionLureId', issues),
			addressId: normalizeOptionalUuid(input.addressId, 'addressId', issues),
			timing: { mode: 'exact_timestamps', startedAt: input.startedAt },
			setByProfileId: normalizeActorDefaultProfileId(input.setByProfileId, input.actorProfileId),
		},
	};
}

export function recordCollectedTrapCollectionCommand(
	input: RecordCollectedTrapCollectionCommandInput,
): RecordCollectedTrapCollectionCommand {
	const issues = validateCollectionBase(input);
	requireUuid(input.trapId, 'trapId', issues);
	const timing = validateCollectedTiming(input.timing, 'timing', issues);
	throwIfIssues('Record collected trap collection command is invalid.', issues);

	return {
		type: 'adultSurveillance.recordCollectedTrapCollection',
		payload: {
			...collectionBasePayload(input),
			trapId: normalizeRequiredId(input.trapId),
			timing,
			setByProfileId: normalizeOptionalUuid(input.setByProfileId, 'setByProfileId', issues),
			collectedByProfileId: normalizeActorDefaultProfileId(
				input.collectedByProfileId,
				input.actorProfileId,
			),
			hasProblem: input.hasProblem ?? false,
			acknowledgedPendingTrapCollection: input.acknowledgedPendingTrapCollection ?? false,
		},
	};
}

export function recordCollectedAdHocCollectionCommand(
	input: RecordCollectedAdHocCollectionCommandInput,
): RecordCollectedAdHocCollectionCommand {
	const issues = validateCollectionBase(input);
	requireUuid(input.collectionMethodId, 'collectionMethodId', issues);
	const locationSource = validateAdultCollectionLocationSourceInput(input, issues);
	const timing = validateCollectedTiming(input.timing, 'timing', issues);
	throwIfIssues('Record collected ad hoc collection command is invalid.', issues);

	return {
		type: 'adultSurveillance.recordCollectedAdHocCollection',
		payload: {
			...collectionBasePayload(input),
			collectionMethodId: normalizeRequiredId(input.collectionMethodId),
			locationSource,
			collectionLureId: normalizeOptionalUuid(input.collectionLureId, 'collectionLureId', issues),
			addressId: normalizeOptionalUuid(input.addressId, 'addressId', issues),
			timing,
			setByProfileId: normalizeOptionalUuid(input.setByProfileId, 'setByProfileId', issues),
			collectedByProfileId: normalizeActorDefaultProfileId(
				input.collectedByProfileId,
				input.actorProfileId,
			),
			hasProblem: input.hasProblem ?? false,
		},
	};
}

export function collectCollectionCommand(
	input: CollectCollectionCommandInput,
): CollectCollectionCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.collectionId, 'collectionId', issues);
	validateOperationalDate(input.collectedAt, 'collectedAt', issues);
	const metadata = normalizeMetadata(input.metadata, 'metadata', issues);
	throwIfIssues('Collect collection command is invalid.', issues);

	return {
		type: 'adultSurveillance.collectCollection',
		payload: {
			...basePayload(input),
			collectionId: normalizeRequiredId(input.collectionId),
			metadata,
			collectedAt: input.collectedAt,
			collectedByProfileId: normalizeActorDefaultProfileId(
				input.collectedByProfileId,
				input.actorProfileId,
			),
			hasProblem: input.hasProblem ?? false,
		},
	};
}

export function cancelPendingCollectionCommand(
	input: CancelPendingCollectionCommandInput,
): CancelPendingCollectionCommand {
	const issues = validateIdCommand(input, 'collectionId');
	throwIfIssues('Cancel pending collection command is invalid.', issues);
	return {
		type: 'adultSurveillance.cancelPendingCollection',
		payload: { ...basePayload(input), collectionId: normalizeRequiredId(input.collectionId) },
	};
}

export function updateCollectionFieldDetailsCommand(
	input: UpdateCollectionFieldDetailsCommandInput,
): UpdateCollectionFieldDetailsCommand {
	const issues = validateCollectionBase(input);
	const hasTiming = input.timing !== undefined;
	const hasSetBy = input.setByProfileId !== undefined;
	const hasCollectedBy = input.collectedByProfileId !== undefined;
	const hasProblem = input.hasProblem !== undefined;
	const hasMetadata = input.metadata !== undefined;
	if (!hasTiming && !hasSetBy && !hasCollectedBy && !hasProblem && !hasMetadata) {
		issues.push({ path: 'changes', message: 'At least one collection field must change.' });
	}
	const timing = hasTiming ? validateTiming(input.timing, 'timing', issues) : undefined;
	const setByProfileId = hasSetBy
		? normalizeOptionalUuid(input.setByProfileId, 'setByProfileId', issues)
		: null;
	const collectedByProfileId = hasCollectedBy
		? normalizeOptionalUuid(input.collectedByProfileId, 'collectedByProfileId', issues)
		: null;
	const metadata = hasMetadata ? normalizeMetadata(input.metadata, 'metadata', issues) : undefined;
	throwIfIssues('Update collection field details command is invalid.', issues);

	return {
		type: 'adultSurveillance.updateCollectionFieldDetails',
		payload: {
			...collectionBasePayload(input),
			changes: {
				...(timing !== undefined ? { timing } : {}),
				...(hasSetBy ? { setByProfileId } : {}),
				...(hasCollectedBy ? { collectedByProfileId } : {}),
				...(hasProblem ? { hasProblem: input.hasProblem } : {}),
				...(hasMetadata ? { metadata: metadata ?? null } : {}),
			},
		},
	};
}

export function updateAdHocCollectionConfigurationCommand(
	input: UpdateAdHocCollectionConfigurationCommandInput,
): UpdateAdHocCollectionConfigurationCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.collectionId, 'collectionId', issues);
	const hasMethod = input.collectionMethodId !== undefined;
	const hasLocation = input.locationSource !== undefined;
	const hasLure = input.collectionLureId !== undefined;
	const hasAddress = input.addressId !== undefined;
	if (!hasMethod && !hasLocation && !hasLure && !hasAddress) {
		issues.push({
			path: 'changes',
			message: 'At least one ad hoc configuration field must change.',
		});
	}
	if (hasMethod) {
		requireUuid(input.collectionMethodId, 'collectionMethodId', issues);
	}
	const locationSource = hasLocation
		? validateAdultCollectionLocationSourceInput(input, issues)
		: undefined;
	throwIfIssues('Update ad hoc collection configuration command is invalid.', issues);

	return {
		type: 'adultSurveillance.updateAdHocCollectionConfiguration',
		payload: {
			...basePayload(input),
			collectionId: normalizeRequiredId(input.collectionId),
			changes: {
				...(hasMethod ? { collectionMethodId: normalizeRequiredId(input.collectionMethodId) } : {}),
				...(locationSource !== undefined ? { locationSource } : {}),
				...(hasLure
					? {
							collectionLureId: normalizeOptionalUuid(
								input.collectionLureId,
								'collectionLureId',
								issues,
							),
						}
					: {}),
				...(hasAddress
					? { addressId: normalizeOptionalUuid(input.addressId, 'addressId', issues) }
					: {}),
			},
		},
	};
}

export function deleteCollectionCommand(
	input: DeleteCollectionCommandInput,
): DeleteCollectionCommand {
	const issues = validateIdCommand(input, 'collectionId');
	throwIfIssues('Delete collection command is invalid.', issues);
	return {
		type: 'adultSurveillance.deleteCollection',
		payload: {
			...basePayload(input),
			collectionId: normalizeRequiredId(input.collectionId),
			acknowledgedSpeciesCountDeletion: input.acknowledgedSpeciesCountDeletion ?? false,
		},
	};
}

export function addCollectionSpeciesCountCommand(
	input: AddCollectionSpeciesCountCommandInput,
): AddCollectionSpeciesCountCommand {
	const issues = validateSpeciesCountBase(input);
	requireUuid(input.collectionId, 'collectionId', issues);
	requireUuid(input.speciesId, 'speciesId', issues);
	validateSpeciesCount(input.count, 'count', issues);
	validateLocalDate(input.identifiedDate, 'identifiedDate', issues);
	throwIfIssues('Add collection species count command is invalid.', issues);

	return {
		type: 'adultSurveillance.addCollectionSpeciesCount',
		payload: {
			...basePayload(input),
			collectionSpeciesId: normalizeRequiredId(input.collectionSpeciesId),
			collectionId: normalizeRequiredId(input.collectionId),
			speciesId: normalizeRequiredId(input.speciesId),
			count: input.count,
			sex: input.sex === undefined ? 'female' : input.sex,
			status: input.status ?? null,
			identifiedByProfileId: normalizeActorDefaultProfileId(
				input.identifiedByProfileId,
				input.actorProfileId,
			),
			identifiedDate: input.identifiedDate,
		},
	};
}

export function updateCollectionSpeciesCountCommand(
	input: UpdateCollectionSpeciesCountCommandInput,
): UpdateCollectionSpeciesCountCommand {
	const issues = validateSpeciesCountBase(input);
	const hasCount = input.count !== undefined;
	const hasSpecies = input.speciesId !== undefined;
	const hasSex = input.sex !== undefined;
	const hasStatus = input.status !== undefined;
	const hasIdentifiedBy = input.identifiedByProfileId !== undefined;
	const hasIdentifiedDate = input.identifiedDate !== undefined;
	if (!hasCount && !hasSpecies && !hasSex && !hasStatus && !hasIdentifiedBy && !hasIdentifiedDate) {
		issues.push({ path: 'changes', message: 'At least one species count field must change.' });
	}
	if (hasCount) {
		validateSpeciesCount(input.count, 'count', issues);
	}
	if (hasSpecies) {
		requireUuid(input.speciesId, 'speciesId', issues);
	}
	if (hasIdentifiedDate) {
		validateLocalDate(input.identifiedDate, 'identifiedDate', issues);
	}
	throwIfIssues('Update collection species count command is invalid.', issues);

	return {
		type: 'adultSurveillance.updateCollectionSpeciesCount',
		payload: {
			...basePayload(input),
			collectionSpeciesId: normalizeRequiredId(input.collectionSpeciesId),
			changes: {
				...(hasCount ? { count: input.count } : {}),
				...(hasSpecies ? { speciesId: normalizeRequiredId(input.speciesId) } : {}),
				...(hasSex ? { sex: input.sex } : {}),
				...(hasStatus ? { status: input.status } : {}),
				...(hasIdentifiedBy
					? {
							identifiedByProfileId: normalizeActorDefaultProfileId(
								input.identifiedByProfileId,
								input.actorProfileId,
							),
						}
					: {}),
				...(hasIdentifiedDate ? { identifiedDate: input.identifiedDate } : {}),
			},
		},
	};
}

export function deleteCollectionSpeciesCountCommand(
	input: DeleteCollectionSpeciesCountCommandInput,
): DeleteCollectionSpeciesCountCommand {
	const issues = validateSpeciesCountBase(input);
	throwIfIssues('Delete collection species count command is invalid.', issues);
	return {
		type: 'adultSurveillance.deleteCollectionSpeciesCount',
		payload: {
			...basePayload(input),
			collectionSpeciesId: normalizeRequiredId(input.collectionSpeciesId),
		},
	};
}

export function markCollectionZeroResultCommand(
	input: MarkCollectionZeroResultCommandInput,
): MarkCollectionZeroResultCommand {
	const issues = validateIdCommand(input, 'collectionId');
	throwIfIssues('Mark collection zero result command is invalid.', issues);
	return {
		type: 'adultSurveillance.markCollectionZeroResult',
		payload: {
			...basePayload(input),
			collectionId: normalizeRequiredId(input.collectionId),
			acknowledgedSpeciesCountsClearance: input.acknowledgedSpeciesCountsClearance ?? false,
		},
	};
}

export function clearCollectionZeroResultCommand(
	input: ClearCollectionZeroResultCommandInput,
): ClearCollectionZeroResultCommand {
	const issues = validateIdCommand(input, 'collectionId');
	throwIfIssues('Clear collection zero result command is invalid.', issues);
	return {
		type: 'adultSurveillance.clearCollectionZeroResult',
		payload: { ...basePayload(input), collectionId: normalizeRequiredId(input.collectionId) },
	};
}

export function setCollectionBycatchCommand(
	input: SetCollectionBycatchCommandInput,
): SetCollectionBycatchCommand {
	const issues = validateIdCommand(input, 'collectionId');
	throwIfIssues('Set collection bycatch command is invalid.', issues);
	return {
		type: 'adultSurveillance.setCollectionBycatch',
		payload: {
			...basePayload(input),
			collectionId: normalizeRequiredId(input.collectionId),
			hasBycatch: input.hasBycatch,
		},
	};
}

export function estimateStartedAtFromTrapNights(input: EstimateStartedAtFromTrapNightsInput): Date {
	const issues = createIssues();
	validateOperationalDate(input.collectedAt, 'collectedAt', issues);
	if (!Number.isInteger(input.trapNights) || input.trapNights <= 0) {
		issues.push({ path: 'trapNights', message: 'trapNights must be a positive integer.' });
	}
	throwIfIssues('Trap night estimate is invalid.', issues);
	return new Date(input.collectedAt.getTime() - input.trapNights * 24 * 60 * 60 * 1000);
}

export function calculateTrapNightRate(input: TrapNightRateInput): number {
	if (input.trapNights <= 0) {
		return 0;
	}

	return Number((input.mosquitoCount / input.trapNights).toFixed(2));
}

function validateBase(input: AdultCommandInput, issues: DomainValidationIssue[]): void {
	validateAgencyCommandContext(input, issues);
}

function validateIdCommand<T extends AdultCommandInput>(
	input: T,
	idKey: keyof T & string,
): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input[idKey] as string | undefined, idKey, issues);
	return issues;
}

function validateCollectionBase(input: CollectionBaseInput): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.collectionId, 'collectionId', issues);
	normalizeMetadata(input.metadata, 'metadata', issues);
	return issues;
}

function validateSpeciesCountBase(
	input:
		| AddCollectionSpeciesCountCommandInput
		| UpdateCollectionSpeciesCountCommandInput
		| DeleteCollectionSpeciesCountCommandInput,
): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.collectionSpeciesId, 'collectionSpeciesId', issues);
	return issues;
}

function validateTiming(
	timing: CollectionTiming | undefined,
	path: string,
	issues: DomainValidationIssue[],
): CollectionTiming | undefined {
	if (timing === undefined) {
		return undefined;
	}
	if (timing.mode === 'collection_date_duration') {
		return validateDateDurationTiming(timing, path, issues);
	}
	validateOperationalDate(timing.startedAt, `${path}.startedAt`, issues);
	if ('collectedAt' in timing) {
		validateCollectedAtAfterStartedAt(timing.startedAt, timing.collectedAt, path, issues);
		return {
			mode: 'exact_timestamps',
			startedAt: timing.startedAt,
			collectedAt: timing.collectedAt,
		};
	}
	return { mode: 'exact_timestamps', startedAt: timing.startedAt };
}

function validateCollectedTiming(
	timing: CollectedCollectionTiming,
	path: string,
	issues: DomainValidationIssue[],
): CollectedCollectionTiming {
	if (timing.mode === 'collection_date_duration') {
		return validateDateDurationTiming(timing, path, issues);
	}
	validateCollectedAtAfterStartedAt(timing.startedAt, timing.collectedAt, path, issues);
	return {
		mode: 'exact_timestamps',
		startedAt: timing.startedAt,
		collectedAt: timing.collectedAt,
	};
}

function validateDateDurationTiming(
	timing: DateDurationCollectionTiming,
	path: string,
	issues: DomainValidationIssue[],
): DateDurationCollectionTiming {
	validateLocalDate(timing.collectionDate, `${path}.collectionDate`, issues);
	if (!Number.isFinite(timing.durationAmount) || timing.durationAmount <= 0) {
		issues.push({
			path: `${path}.durationAmount`,
			message: 'durationAmount must be greater than zero.',
		});
	}
	requireUuid(timing.durationUnitId, `${path}.durationUnitId`, issues);
	return {
		mode: 'collection_date_duration',
		collectionDate: timing.collectionDate,
		durationAmount: timing.durationAmount,
		durationUnitId: normalizeRequiredId(timing.durationUnitId),
	};
}

function validateCollectedAtAfterStartedAt(
	startedAt: Date,
	collectedAt: Date,
	path: string,
	issues: DomainValidationIssue[],
): void {
	validateOperationalDate(startedAt, `${path}.startedAt`, issues);
	validateOperationalDate(collectedAt, `${path}.collectedAt`, issues);
	if (isValidDate(startedAt) && isValidDate(collectedAt) && collectedAt < startedAt) {
		issues.push({
			path: `${path}.collectedAt`,
			message: 'collectedAt must be greater than or equal to startedAt.',
		});
	}
}

function validateTrapDisplay(
	trapName: string | null,
	trapCode: string | null,
	issues: DomainValidationIssue[],
): void {
	if (trapName === null && trapCode === null) {
		issues.push({
			path: 'trapDisplay',
			message: 'At least one of trapName or trapCode is required.',
		});
	}
}

function validateTrapLocationSourceInput(
	input: {
		readonly locationSource?: TrapLocationSourceInput;
	},
	issues: DomainValidationIssue[],
): TrapLocationSource {
	const hasLocationSource = input.locationSource !== undefined;
	if (hasLocationSource) {
		return validateTrapLocationSource(input.locationSource, 'locationSource', issues);
	}
	issues.push({ path: 'locationSource', message: 'locationSource is required.' });
	return validateTrapLocationSource(
		{ kind: 'geometry', geometry: { type: 'Point', coordinates: [0, 0] } },
		'locationSource',
		issues,
	);
}

function validateAdultCollectionLocationSourceInput(
	input: {
		readonly locationSource?: AdultCollectionLocationSourceInput;
	},
	issues: DomainValidationIssue[],
): AdultCollectionLocationSource {
	const hasLocationSource = input.locationSource !== undefined;
	if (hasLocationSource) {
		return validateAdultCollectionLocationSource(input.locationSource, 'locationSource', issues);
	}
	issues.push({ path: 'locationSource', message: 'locationSource is required.' });
	return validateAdultCollectionLocationSource(
		{ kind: 'geometry', geometry: { type: 'Point', coordinates: [0, 0] } },
		'locationSource',
		issues,
	);
}

function validateSpeciesCount(
	count: number | undefined,
	path: string,
	issues: DomainValidationIssue[],
): void {
	if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0) {
		issues.push({ path, message: 'count must be a positive integer.' });
	}
}

function validateOperationalDate(
	value: Date | undefined,
	path: string,
	issues: DomainValidationIssue[],
): void {
	if (!isValidDate(value)) {
		issues.push({ path, message: `${path} must be a valid Date.` });
		return;
	}
	if (value.getTime() > Date.now()) {
		issues.push({ path, message: `${path} cannot be in the future.` });
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

function normalizeNullableText(value: string | null | undefined): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function collectionBasePayload(input: CollectionBaseInput): CollectionBasePayload {
	const issues = createIssues();
	return {
		...basePayload(input),
		collectionId: normalizeRequiredId(input.collectionId),
		metadata: normalizeMetadata(input.metadata, 'metadata', issues),
	};
}

function basePayload(input: AdultCommandInput): AdultCommandPayload {
	return validateAgencyCommandContext(input, createIssues());
}

function isValidDate(value: Date | undefined): value is Date {
	return value instanceof Date && !Number.isNaN(value.getTime());
}
