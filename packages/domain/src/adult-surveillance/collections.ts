import {
	createIssues,
	actorDefaultProfileId as normalizeActorDefaultProfileId,
	optionalUuid as normalizeOptionalUuid,
	requiredId as normalizeRequiredId,
	requiredUuid as requireUuid,
	throwIfIssues,
} from '../command-validation.js';
import type { AdultCollectionLocationSource } from '../location-intent.js';
import type { DomainId } from '../shared.js';
import {
	type AdultCommandInput,
	type AdultCommandPayload,
	basePayload,
	type CollectedCollectionTiming,
	type CollectionBaseInput,
	type CollectionBasePayload,
	type CollectionTiming,
	collectionBasePayload,
	type DomainCommand,
	validateAdultCollectionLocationSourceInput,
	validateCollectedTiming,
	validateCollectionBase,
	validateIdCommand,
	validateOperationalDate,
	validateTiming,
} from './shared.js';

export interface SetTrapCollectionCommandInput extends CollectionBaseInput {
	readonly trapId: DomainId;
	readonly startedAt: Date;
	readonly setByProfileId?: DomainId | null;
}

export interface SetTrapCollectionCommandPayload extends CollectionBasePayload {
	readonly trapId: DomainId;
	readonly timing: import('./shared.js').ExactPendingCollectionTiming;
	readonly setByProfileId: DomainId;
}

export type SetTrapCollectionCommand = DomainCommand<
	'adultSurveillance.setTrapCollection',
	SetTrapCollectionCommandPayload
>;

export interface SetAdHocCollectionCommandInput extends CollectionBaseInput {
	readonly collectionMethodId: DomainId;
	readonly locationSource: import('../location-intent.js').AdultCollectionLocationSourceInput;
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
	readonly timing: import('./shared.js').ExactPendingCollectionTiming;
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
	readonly locationSource: import('../location-intent.js').AdultCollectionLocationSourceInput;
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
		readonly metadata?: import('../shared.js').JsonObject | null;
	}>;
}

export type UpdateCollectionFieldDetailsCommand = DomainCommand<
	'adultSurveillance.updateCollectionFieldDetails',
	UpdateCollectionFieldDetailsCommandPayload
>;

export interface UpdateAdHocCollectionConfigurationCommandInput extends AdultCommandInput {
	readonly collectionId: DomainId;
	readonly collectionMethodId?: DomainId;
	readonly locationSource?: import('../location-intent.js').AdultCollectionLocationSourceInput;
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

export interface TrapNightRateInput {
	readonly mosquitoCount: number;
	readonly trapNights: number;
}

export interface EstimateStartedAtFromTrapNightsInput {
	readonly collectedAt: Date;
	readonly trapNights: number;
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
	const collectionBaseIssues = validateCollectionBase({
		organizationId: input.organizationId,
		actorProfileId: input.actorProfileId,
		collectionId: input.collectionId,
		metadata: input.metadata,
	});
	issues.push(...collectionBaseIssues);
	validateOperationalDate(input.collectedAt, 'collectedAt', issues);
	throwIfIssues('Collect collection command is invalid.', issues);

	return {
		type: 'adultSurveillance.collectCollection',
		payload: {
			...collectionBasePayload({
				organizationId: input.organizationId,
				actorProfileId: input.actorProfileId,
				collectionId: input.collectionId,
				metadata: input.metadata,
			}),
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
				...(hasMetadata ? { metadata: collectionBasePayload(input).metadata } : {}),
			},
		},
	};
}

export function updateAdHocCollectionConfigurationCommand(
	input: UpdateAdHocCollectionConfigurationCommandInput,
): UpdateAdHocCollectionConfigurationCommand {
	const issues = createIssues();
	const baseIssues = validateIdCommand(input, 'collectionId');
	issues.push(...baseIssues);
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
