import {
	createIssues,
	optionalUuid as normalizeOptionalUuid,
	requiredId as normalizeRequiredId,
	requiredText as normalizeRequiredText,
	requiredUuid as requireUuid,
	throwIfIssues,
} from '../command-validation.js';
import {
	type ApplicationBatchInput,
	normalizeMissionBiocontrolFields,
	normalizeMissionChemicalApplicationFields,
	normalizeMissionOutreachFields,
	normalizeMissionSourceReductionFields,
	validateControlActionContext,
} from '../performed-control-actions.js';
import type { DomainId, LocalDateString, SupportedGeoJsonGeometry } from '../shared.js';
import {
	basePayload,
	type MissionDispatchCommandInput,
	type MissionDispatchCommandPayload,
	type MissionDispatchDomainCommand,
	type MissionExecutionOptions,
	type MissionExecutionOverrides,
	type MissionExecutionPayload,
	type MissionItemLocationInput,
	type MissionItemPlacement,
	type MissionItemStatus,
	missionExecutionPayload,
	normalizeOptionalTimestamp,
	validateIdCommand,
	validateIdList,
	validateMissionExecutionBase,
	validateMissionItemLocationInput,
	validateMissionItemPlacement,
} from './shared.js';

export interface AddMissionItemCommandInput
	extends MissionDispatchCommandInput,
		MissionItemLocationInput {
	readonly missionItemId: DomainId;
	readonly missionId: DomainId;
	readonly placement?: MissionItemPlacement;
	readonly acknowledgedDuplicateRequestedActionMissioning?: boolean;
	readonly acknowledgedMethodMismatch?: boolean;
	readonly acknowledgedInProgressMissionChange?: boolean;
	readonly acknowledgedNotificationGeometryChange?: boolean;
}

export type AddMissionItemCommand = MissionDispatchDomainCommand<
	'missionDispatch.addMissionItem',
	MissionDispatchCommandPayload & {
		readonly missionItemId: DomainId;
		readonly missionId: DomainId;
		readonly geometry?: SupportedGeoJsonGeometry;
		readonly locationSource?: import('../location-intent.js').MissionItemLocationSource;
		readonly addressId: DomainId | null;
		readonly requestedControlActionId: DomainId | null;
		readonly placement: MissionItemPlacement;
		readonly acknowledgedDuplicateRequestedActionMissioning: boolean;
		readonly acknowledgedMethodMismatch: boolean;
		readonly acknowledgedInProgressMissionChange: boolean;
		readonly acknowledgedNotificationGeometryChange: boolean;
	}
>;

export interface AddMissionItemFromRequestedControlActionCommandInput
	extends MissionDispatchCommandInput {
	readonly missionItemId: DomainId;
	readonly missionId: DomainId;
	readonly requestedControlActionId: DomainId;
	readonly placement?: MissionItemPlacement;
	readonly acknowledgedDuplicateRequestedActionMissioning?: boolean;
	readonly acknowledgedMethodMismatch?: boolean;
	readonly acknowledgedInProgressMissionChange?: boolean;
	readonly acknowledgedNotificationGeometryChange?: boolean;
}

export type AddMissionItemFromRequestedControlActionCommand = MissionDispatchDomainCommand<
	'missionDispatch.addMissionItemFromRequestedControlAction',
	MissionDispatchCommandPayload & {
		readonly missionItemId: DomainId;
		readonly missionId: DomainId;
		readonly requestedControlActionId: DomainId;
		readonly placement: MissionItemPlacement;
		readonly acknowledgedDuplicateRequestedActionMissioning: boolean;
		readonly acknowledgedMethodMismatch: boolean;
		readonly acknowledgedInProgressMissionChange: boolean;
		readonly acknowledgedNotificationGeometryChange: boolean;
	}
>;

export interface UpdateMissionItemLocationAndLinkCommandInput extends MissionDispatchCommandInput {
	readonly missionItemId: DomainId;
	readonly geometry?: unknown;
	readonly locationSource?: import('../location-intent.js').MissionItemLocationSourceInput;
	readonly addressId?: DomainId | null;
	readonly requestedControlActionId?: DomainId | null;
	readonly acknowledgedNotificationGeometryChange?: boolean;
	readonly acknowledgedActualActionContextChange?: boolean;
	readonly acknowledgedProgressedItemLinkChange?: boolean;
	readonly acknowledgedMethodMismatch?: boolean;
	readonly acknowledgedDuplicateRequestedActionMissioning?: boolean;
}

export type UpdateMissionItemLocationAndLinkCommand = MissionDispatchDomainCommand<
	'missionDispatch.updateMissionItemLocationAndLink',
	MissionDispatchCommandPayload & {
		readonly missionItemId: DomainId;
		readonly changes: Readonly<{
			readonly geometry?: SupportedGeoJsonGeometry;
			readonly locationSource?: import('../location-intent.js').MissionItemLocationSource;
			readonly addressId?: DomainId | null;
			readonly requestedControlActionId?: DomainId | null;
		}>;
		readonly acknowledgedNotificationGeometryChange: boolean;
		readonly acknowledgedActualActionContextChange: boolean;
		readonly acknowledgedProgressedItemLinkChange: boolean;
		readonly acknowledgedMethodMismatch: boolean;
		readonly acknowledgedDuplicateRequestedActionMissioning: boolean;
	}
>;

export interface RemoveMissionItemCommandInput extends MissionDispatchCommandInput {
	readonly missionItemId: DomainId;
	readonly acknowledgedItemProgressDeletion?: boolean;
	readonly acknowledgedActualActionDetach?: boolean;
	readonly acknowledgedNotificationGeometryChange?: boolean;
}

export type RemoveMissionItemCommand = MissionDispatchDomainCommand<
	'missionDispatch.removeMissionItem',
	MissionDispatchCommandPayload & {
		readonly missionItemId: DomainId;
		readonly acknowledgedItemProgressDeletion: boolean;
		readonly acknowledgedActualActionDetach: boolean;
		readonly acknowledgedNotificationGeometryChange: boolean;
	}
>;

export interface MoveMissionItemsCommandInput extends MissionDispatchCommandInput {
	readonly missionId: DomainId;
	readonly missionItemIds: readonly DomainId[];
	readonly placement: MissionItemPlacement;
	readonly acknowledgedProgressedItemReorder?: boolean;
}

export type MoveMissionItemsCommand = MissionDispatchDomainCommand<
	'missionDispatch.moveMissionItems',
	MissionDispatchCommandPayload & {
		readonly missionId: DomainId;
		readonly missionItemIds: readonly DomainId[];
		readonly placement: MissionItemPlacement;
		readonly acknowledgedProgressedItemReorder: boolean;
	}
>;

export interface MissionItemIdCommandInput extends MissionDispatchCommandInput {
	readonly missionItemId: DomainId;
}

export interface CompleteMissionItemCommandInput extends MissionItemIdCommandInput {
	readonly completedAt?: Date | null;
	readonly autoStartMission?: boolean;
	readonly acknowledgedEarlyStart?: boolean;
}

export type CompleteMissionItemCommand = MissionDispatchDomainCommand<
	'missionDispatch.completeMissionItem',
	MissionDispatchCommandPayload & {
		readonly missionItemId: DomainId;
		readonly completedAt: Date | null;
		readonly autoStartMission: boolean;
		readonly acknowledgedEarlyStart: boolean;
	}
>;

export type ReopenMissionItemCommand = MissionDispatchDomainCommand<
	'missionDispatch.reopenMissionItem',
	MissionDispatchCommandPayload & { readonly missionItemId: DomainId }
>;

export interface SkipMissionItemCommandInput extends MissionItemIdCommandInput {
	readonly skippedAt?: Date | null;
	readonly skipReason: string;
	readonly autoStartMission?: boolean;
	readonly acknowledgedEarlyStart?: boolean;
}

export type SkipMissionItemCommand = MissionDispatchDomainCommand<
	'missionDispatch.skipMissionItem',
	MissionDispatchCommandPayload & {
		readonly missionItemId: DomainId;
		readonly skippedAt: Date | null;
		readonly skipReason: string;
		readonly autoStartMission: boolean;
		readonly acknowledgedEarlyStart: boolean;
	}
>;

export type UnskipMissionItemCommand = MissionDispatchDomainCommand<
	'missionDispatch.unskipMissionItem',
	MissionDispatchCommandPayload & { readonly missionItemId: DomainId }
>;

export interface RecordChemicalApplicationForMissionItemCommandInput
	extends MissionDispatchCommandInput,
		MissionExecutionOptions,
		MissionExecutionOverrides {
	readonly missionItemId: DomainId;
	readonly applicationId: DomainId;
	readonly insecticideId: DomainId;
	readonly amountApplied: number;
	readonly applicationUnitId: DomainId;
	readonly applicationDate: LocalDateString;
	readonly applicatorProfileId?: DomainId | null;
	readonly applicationMethodId?: DomainId | null;
	readonly vehicleId?: DomainId | null;
	readonly equipmentId?: DomainId | null;
	readonly applicationBatches?: readonly ApplicationBatchInput[];
}

export type RecordChemicalApplicationForMissionItemCommand = MissionDispatchDomainCommand<
	'missionDispatch.recordChemicalApplicationForMissionItem',
	MissionDispatchCommandPayload &
		MissionExecutionPayload & {
			readonly missionItemId: DomainId;
			readonly applicationId: DomainId;
			readonly insecticideId: DomainId;
			readonly amountApplied: number;
			readonly applicationUnitId: DomainId;
			readonly applicationDate: LocalDateString;
			readonly applicatorProfileId: DomainId;
			readonly applicationMethodId: DomainId | null;
			readonly vehicleId: DomainId | null;
			readonly equipmentId: DomainId | null;
			readonly applicationBatches: readonly ApplicationBatchInput[];
		}
>;

export interface RecordSourceReductionForMissionItemCommandInput
	extends MissionDispatchCommandInput,
		MissionExecutionOptions,
		MissionExecutionOverrides {
	readonly missionItemId: DomainId;
	readonly sourceReductionId: DomainId;
	readonly sourceReductionDate: LocalDateString;
	readonly sourcesEliminatedAmount: number;
	readonly sourcesEliminatedUnitId: DomainId;
	readonly sourceReductionMethodId?: DomainId | null;
	readonly technicianProfileId?: DomainId | null;
}

export type RecordSourceReductionForMissionItemCommand = MissionDispatchDomainCommand<
	'missionDispatch.recordSourceReductionForMissionItem',
	MissionDispatchCommandPayload &
		MissionExecutionPayload & {
			readonly missionItemId: DomainId;
			readonly sourceReductionId: DomainId;
			readonly sourceReductionDate: LocalDateString;
			readonly sourcesEliminatedAmount: number;
			readonly sourcesEliminatedUnitId: DomainId;
			readonly sourceReductionMethodId: DomainId | null;
			readonly technicianProfileId: DomainId;
		}
>;

export interface RecordOutreachActionForMissionItemCommandInput
	extends MissionDispatchCommandInput,
		MissionExecutionOptions,
		MissionExecutionOverrides {
	readonly missionItemId: DomainId;
	readonly outreachActionId: DomainId;
	readonly outreachDate: LocalDateString;
	readonly reach: number;
	readonly outreachMethodId?: DomainId | null;
	readonly technicianProfileId?: DomainId | null;
	readonly reachDescription?: string | null;
}

export type RecordOutreachActionForMissionItemCommand = MissionDispatchDomainCommand<
	'missionDispatch.recordOutreachActionForMissionItem',
	MissionDispatchCommandPayload &
		MissionExecutionPayload & {
			readonly missionItemId: DomainId;
			readonly outreachActionId: DomainId;
			readonly outreachDate: LocalDateString;
			readonly reach: number;
			readonly outreachMethodId: DomainId | null;
			readonly technicianProfileId: DomainId;
			readonly reachDescription: string | null;
		}
>;

export interface RecordBiocontrolActionForMissionItemCommandInput
	extends MissionDispatchCommandInput,
		MissionExecutionOptions,
		MissionExecutionOverrides {
	readonly missionItemId: DomainId;
	readonly biocontrolActionId: DomainId;
	readonly biocontrolDate: LocalDateString;
	readonly amountReleased: number;
	readonly releaseUnitId: DomainId;
	readonly biocontrolMethodId?: DomainId | null;
	readonly technicianProfileId?: DomainId | null;
}

export type RecordBiocontrolActionForMissionItemCommand = MissionDispatchDomainCommand<
	'missionDispatch.recordBiocontrolActionForMissionItem',
	MissionDispatchCommandPayload &
		MissionExecutionPayload & {
			readonly missionItemId: DomainId;
			readonly biocontrolActionId: DomainId;
			readonly biocontrolDate: LocalDateString;
			readonly amountReleased: number;
			readonly releaseUnitId: DomainId;
			readonly biocontrolMethodId: DomainId | null;
			readonly technicianProfileId: DomainId;
		}
>;

export function deriveMissionItemStatus(input: {
	readonly completedAt?: Date | string | null;
	readonly skippedAt?: Date | string | null;
	readonly deletedAt?: Date | string | null;
}): MissionItemStatus {
	if (input.deletedAt != null) {
		return 'deleted';
	}
	if (input.completedAt != null) {
		return 'completed';
	}
	if (input.skippedAt != null) {
		return 'skipped';
	}
	return 'pending';
}

export function addMissionItemCommand(input: AddMissionItemCommandInput): AddMissionItemCommand {
	const issues = createIssues();
	const baseIssues = validateIdCommand(input, 'missionItemId');
	issues.push(...baseIssues);
	requireUuid(input.missionId, 'missionId', issues);
	const location = validateMissionItemLocationInput(input, 'location', issues, true);
	const addressId = normalizeOptionalUuid(input.addressId, 'addressId', issues);
	const requestedControlActionId = normalizeOptionalUuid(
		input.requestedControlActionId,
		'requestedControlActionId',
		issues,
	);
	const placement = validateMissionItemPlacement(
		input.placement ?? { kind: 'end' },
		'placement',
		issues,
	);
	throwIfIssues('Add mission item command is invalid.', issues);
	return {
		type: 'missionDispatch.addMissionItem',
		payload: {
			...basePayload(input),
			missionItemId: normalizeRequiredId(input.missionItemId),
			missionId: normalizeRequiredId(input.missionId),
			...location,
			addressId,
			requestedControlActionId,
			placement,
			acknowledgedDuplicateRequestedActionMissioning:
				input.acknowledgedDuplicateRequestedActionMissioning ?? false,
			acknowledgedMethodMismatch: input.acknowledgedMethodMismatch ?? false,
			acknowledgedInProgressMissionChange: input.acknowledgedInProgressMissionChange ?? false,
			acknowledgedNotificationGeometryChange: input.acknowledgedNotificationGeometryChange ?? false,
		},
	};
}

export function addMissionItemFromRequestedControlActionCommand(
	input: AddMissionItemFromRequestedControlActionCommandInput,
): AddMissionItemFromRequestedControlActionCommand {
	const issues = createIssues();
	const baseIssues = validateIdCommand(input, 'missionItemId');
	issues.push(...baseIssues);
	requireUuid(input.missionId, 'missionId', issues);
	requireUuid(input.requestedControlActionId, 'requestedControlActionId', issues);
	const placement = validateMissionItemPlacement(
		input.placement ?? { kind: 'end' },
		'placement',
		issues,
	);
	throwIfIssues('Add mission item from requested control action command is invalid.', issues);
	return {
		type: 'missionDispatch.addMissionItemFromRequestedControlAction',
		payload: {
			...basePayload(input),
			missionItemId: normalizeRequiredId(input.missionItemId),
			missionId: normalizeRequiredId(input.missionId),
			requestedControlActionId: normalizeRequiredId(input.requestedControlActionId),
			placement,
			acknowledgedDuplicateRequestedActionMissioning:
				input.acknowledgedDuplicateRequestedActionMissioning ?? false,
			acknowledgedMethodMismatch: input.acknowledgedMethodMismatch ?? false,
			acknowledgedInProgressMissionChange: input.acknowledgedInProgressMissionChange ?? false,
			acknowledgedNotificationGeometryChange: input.acknowledgedNotificationGeometryChange ?? false,
		},
	};
}

export function updateMissionItemLocationAndLinkCommand(
	input: UpdateMissionItemLocationAndLinkCommandInput,
): UpdateMissionItemLocationAndLinkCommand {
	const issues = validateIdCommand(input, 'missionItemId');
	const hasGeometry = input.geometry !== undefined;
	const hasLocationSource = input.locationSource !== undefined;
	const hasAddress = input.addressId !== undefined;
	const hasRequested = input.requestedControlActionId !== undefined;
	if (!hasGeometry && !hasLocationSource && !hasAddress && !hasRequested) {
		issues.push({
			path: 'changes',
			message: 'At least one mission item location or link field must change.',
		});
	}
	const location = validateMissionItemLocationInput(input, 'location', issues, false);
	const addressId = hasAddress
		? normalizeOptionalUuid(input.addressId, 'addressId', issues)
		: undefined;
	const requestedControlActionId = hasRequested
		? normalizeOptionalUuid(input.requestedControlActionId, 'requestedControlActionId', issues)
		: undefined;
	throwIfIssues('Update mission item location and link command is invalid.', issues);
	const changes: UpdateMissionItemLocationAndLinkCommand['payload']['changes'] = {
		...location,
		...(hasAddress ? { addressId: addressId ?? null } : {}),
		...(hasRequested ? { requestedControlActionId: requestedControlActionId ?? null } : {}),
	};
	return {
		type: 'missionDispatch.updateMissionItemLocationAndLink',
		payload: {
			...basePayload(input),
			missionItemId: normalizeRequiredId(input.missionItemId),
			changes,
			acknowledgedNotificationGeometryChange: input.acknowledgedNotificationGeometryChange ?? false,
			acknowledgedActualActionContextChange: input.acknowledgedActualActionContextChange ?? false,
			acknowledgedProgressedItemLinkChange: input.acknowledgedProgressedItemLinkChange ?? false,
			acknowledgedMethodMismatch: input.acknowledgedMethodMismatch ?? false,
			acknowledgedDuplicateRequestedActionMissioning:
				input.acknowledgedDuplicateRequestedActionMissioning ?? false,
		},
	};
}

export function removeMissionItemCommand(
	input: RemoveMissionItemCommandInput,
): RemoveMissionItemCommand {
	const issues = validateIdCommand(input, 'missionItemId');
	throwIfIssues('Remove mission item command is invalid.', issues);
	return {
		type: 'missionDispatch.removeMissionItem',
		payload: {
			...basePayload(input),
			missionItemId: normalizeRequiredId(input.missionItemId),
			acknowledgedItemProgressDeletion: input.acknowledgedItemProgressDeletion ?? false,
			acknowledgedActualActionDetach: input.acknowledgedActualActionDetach ?? false,
			acknowledgedNotificationGeometryChange: input.acknowledgedNotificationGeometryChange ?? false,
		},
	};
}

export function moveMissionItemsCommand(
	input: MoveMissionItemsCommandInput,
): MoveMissionItemsCommand {
	const issues = createIssues();
	const baseIssues = validateIdCommand(input, 'missionId');
	issues.push(...baseIssues);
	const missionItemIds = validateIdList(input.missionItemIds, 'missionItemIds', issues);
	const placement = validateMissionItemPlacement(input.placement, 'placement', issues);
	throwIfIssues('Move mission items command is invalid.', issues);
	return {
		type: 'missionDispatch.moveMissionItems',
		payload: {
			...basePayload(input),
			missionId: normalizeRequiredId(input.missionId),
			missionItemIds,
			placement,
			acknowledgedProgressedItemReorder: input.acknowledgedProgressedItemReorder ?? false,
		},
	};
}

export function completeMissionItemCommand(
	input: CompleteMissionItemCommandInput,
): CompleteMissionItemCommand {
	const issues = validateIdCommand(input, 'missionItemId');
	const completedAt = normalizeOptionalTimestamp(input.completedAt, 'completedAt', issues, false);
	throwIfIssues('Complete mission item command is invalid.', issues);
	return {
		type: 'missionDispatch.completeMissionItem',
		payload: {
			...basePayload(input),
			missionItemId: normalizeRequiredId(input.missionItemId),
			completedAt,
			autoStartMission: input.autoStartMission ?? true,
			acknowledgedEarlyStart: input.acknowledgedEarlyStart ?? false,
		},
	};
}

export function reopenMissionItemCommand(
	input: MissionItemIdCommandInput,
): ReopenMissionItemCommand {
	const issues = validateIdCommand(input, 'missionItemId');
	throwIfIssues('Reopen mission item command is invalid.', issues);
	return {
		type: 'missionDispatch.reopenMissionItem',
		payload: { ...basePayload(input), missionItemId: normalizeRequiredId(input.missionItemId) },
	};
}

export function skipMissionItemCommand(input: SkipMissionItemCommandInput): SkipMissionItemCommand {
	const issues = validateIdCommand(input, 'missionItemId');
	const skippedAt = normalizeOptionalTimestamp(input.skippedAt, 'skippedAt', issues, false);
	const skipReason = normalizeRequiredText(input.skipReason, 'skipReason', issues, 2_000);
	throwIfIssues('Skip mission item command is invalid.', issues);
	return {
		type: 'missionDispatch.skipMissionItem',
		payload: {
			...basePayload(input),
			missionItemId: normalizeRequiredId(input.missionItemId),
			skippedAt,
			skipReason,
			autoStartMission: input.autoStartMission ?? true,
			acknowledgedEarlyStart: input.acknowledgedEarlyStart ?? false,
		},
	};
}

export function unskipMissionItemCommand(
	input: MissionItemIdCommandInput,
): UnskipMissionItemCommand {
	const issues = validateIdCommand(input, 'missionItemId');
	throwIfIssues('Unskip mission item command is invalid.', issues);
	return {
		type: 'missionDispatch.unskipMissionItem',
		payload: { ...basePayload(input), missionItemId: normalizeRequiredId(input.missionItemId) },
	};
}

export function recordChemicalApplicationForMissionItemCommand(
	input: RecordChemicalApplicationForMissionItemCommandInput,
): RecordChemicalApplicationForMissionItemCommand {
	const issues = validateMissionExecutionBase(
		input,
		'chemicalApplication',
		validateControlActionContext,
	);
	requireUuid(input.applicationId, 'applicationId', issues);
	const fields = normalizeMissionChemicalApplicationFields(input, issues);
	throwIfIssues('Record chemical application for mission item command is invalid.', issues);
	return {
		type: 'missionDispatch.recordChemicalApplicationForMissionItem',
		payload: {
			...basePayload(input),
			...missionExecutionPayload(
				input,
				'chemicalApplication',
				issues,
				validateControlActionContext,
			),
			missionItemId: normalizeRequiredId(input.missionItemId),
			applicationId: normalizeRequiredId(input.applicationId),
			insecticideId: fields.insecticideId,
			amountApplied: fields.amountApplied,
			applicationUnitId: fields.applicationUnitId,
			applicationDate: fields.applicationDate,
			applicatorProfileId: fields.applicatorProfileId,
			applicationMethodId: fields.applicationMethodId,
			vehicleId: fields.vehicleId,
			equipmentId: fields.equipmentId,
			applicationBatches: fields.applicationBatches,
		},
	};
}

export function recordSourceReductionForMissionItemCommand(
	input: RecordSourceReductionForMissionItemCommandInput,
): RecordSourceReductionForMissionItemCommand {
	const issues = validateMissionExecutionBase(
		input,
		'sourceReduction',
		validateControlActionContext,
	);
	requireUuid(input.sourceReductionId, 'sourceReductionId', issues);
	const fields = normalizeMissionSourceReductionFields(input, issues);
	throwIfIssues('Record source reduction for mission item command is invalid.', issues);
	return {
		type: 'missionDispatch.recordSourceReductionForMissionItem',
		payload: {
			...basePayload(input),
			...missionExecutionPayload(input, 'sourceReduction', issues, validateControlActionContext),
			missionItemId: normalizeRequiredId(input.missionItemId),
			sourceReductionId: normalizeRequiredId(input.sourceReductionId),
			sourceReductionDate: fields.sourceReductionDate,
			sourcesEliminatedAmount: fields.sourcesEliminatedAmount,
			sourcesEliminatedUnitId: fields.sourcesEliminatedUnitId,
			sourceReductionMethodId: fields.sourceReductionMethodId,
			technicianProfileId: fields.technicianProfileId,
		},
	};
}

export function recordOutreachActionForMissionItemCommand(
	input: RecordOutreachActionForMissionItemCommandInput,
): RecordOutreachActionForMissionItemCommand {
	const issues = validateMissionExecutionBase(input, 'outreach', validateControlActionContext);
	requireUuid(input.outreachActionId, 'outreachActionId', issues);
	const fields = normalizeMissionOutreachFields(input, issues);
	throwIfIssues('Record outreach action for mission item command is invalid.', issues);
	return {
		type: 'missionDispatch.recordOutreachActionForMissionItem',
		payload: {
			...basePayload(input),
			...missionExecutionPayload(input, 'outreach', issues, validateControlActionContext),
			missionItemId: normalizeRequiredId(input.missionItemId),
			outreachActionId: normalizeRequiredId(input.outreachActionId),
			outreachDate: fields.outreachDate,
			reach: fields.reach,
			outreachMethodId: fields.outreachMethodId,
			technicianProfileId: fields.technicianProfileId,
			reachDescription: fields.reachDescription,
		},
	};
}

export function recordBiocontrolActionForMissionItemCommand(
	input: RecordBiocontrolActionForMissionItemCommandInput,
): RecordBiocontrolActionForMissionItemCommand {
	const issues = validateMissionExecutionBase(input, 'biocontrol', validateControlActionContext);
	requireUuid(input.biocontrolActionId, 'biocontrolActionId', issues);
	const fields = normalizeMissionBiocontrolFields(input, issues);
	throwIfIssues('Record biocontrol action for mission item command is invalid.', issues);
	return {
		type: 'missionDispatch.recordBiocontrolActionForMissionItem',
		payload: {
			...basePayload(input),
			...missionExecutionPayload(input, 'biocontrol', issues, validateControlActionContext),
			missionItemId: normalizeRequiredId(input.missionItemId),
			biocontrolActionId: normalizeRequiredId(input.biocontrolActionId),
			biocontrolDate: fields.biocontrolDate,
			amountReleased: fields.amountReleased,
			releaseUnitId: fields.releaseUnitId,
			biocontrolMethodId: fields.biocontrolMethodId,
			technicianProfileId: fields.technicianProfileId,
		},
	};
}
