import type {
	ApplicationBatchInput,
	ControlActionContext,
	ControlType,
} from './control-operations.js';
import {
	type DomainId,
	DomainValidationError,
	type DomainValidationIssue,
	type JsonObject,
	type LocalDateString,
	normalizeLocatableGeometry,
	type SupportedGeoJsonGeometry,
} from './shared.js';

export type MissionLifecycleStatus =
	| 'scheduled'
	| 'inProgress'
	| 'completed'
	| 'cancelled'
	| 'deleted';

export type MissionItemStatus = 'pending' | 'completed' | 'skipped' | 'deleted';

export type MissionDispatchCommandType =
	| 'missionDispatch.createMission'
	| 'missionDispatch.updateMissionDetails'
	| 'missionDispatch.updateMissionSchedule'
	| 'missionDispatch.updateMissionPlan'
	| 'missionDispatch.assignMission'
	| 'missionDispatch.updateMissionNotificationType'
	| 'missionDispatch.startMission'
	| 'missionDispatch.completeMission'
	| 'missionDispatch.cancelMission'
	| 'missionDispatch.reopenMission'
	| 'missionDispatch.deleteMission'
	| 'missionDispatch.addMissionItem'
	| 'missionDispatch.addMissionItemFromRequestedControlAction'
	| 'missionDispatch.updateMissionItemLocationAndLink'
	| 'missionDispatch.removeMissionItem'
	| 'missionDispatch.moveMissionItems'
	| 'missionDispatch.completeMissionItem'
	| 'missionDispatch.reopenMissionItem'
	| 'missionDispatch.skipMissionItem'
	| 'missionDispatch.unskipMissionItem'
	| 'missionDispatch.recordChemicalApplicationForMissionItem'
	| 'missionDispatch.recordSourceReductionForMissionItem'
	| 'missionDispatch.recordOutreachActionForMissionItem'
	| 'missionDispatch.recordBiocontrolActionForMissionItem';

export interface MissionDispatchDomainCommand<
	TType extends MissionDispatchCommandType,
	TPayload,
> {
	readonly type: TType;
	readonly payload: TPayload;
}

interface MissionDispatchCommandInput {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

interface MissionDispatchCommandPayload {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export type MissionItemPlacement =
	| { readonly kind: 'start' }
	| { readonly kind: 'end' }
	| { readonly kind: 'before'; readonly missionItemId: DomainId }
	| { readonly kind: 'after'; readonly missionItemId: DomainId };

export type MissionInitialItemInput =
	| {
			readonly kind: 'explicit';
			readonly missionItemId: DomainId;
			readonly geometry: unknown;
			readonly addressId?: DomainId | null;
			readonly requestedControlActionId?: DomainId | null;
	  }
	| {
			readonly kind: 'fromRequestedControlAction';
			readonly missionItemId: DomainId;
			readonly requestedControlActionId: DomainId;
	  };

export type MissionInitialItem =
	| {
			readonly kind: 'explicit';
			readonly missionItemId: DomainId;
			readonly geometry: SupportedGeoJsonGeometry;
			readonly addressId: DomainId | null;
			readonly requestedControlActionId: DomainId | null;
	  }
	| {
			readonly kind: 'fromRequestedControlAction';
			readonly missionItemId: DomainId;
			readonly requestedControlActionId: DomainId;
	  };

export interface MissionItemLocationInput {
	readonly geometry: unknown;
	readonly addressId?: DomainId | null;
	readonly requestedControlActionId?: DomainId | null;
}

export interface CreateMissionCommandInput extends MissionDispatchCommandInput {
	readonly missionId: DomainId;
	readonly controlType: ControlType;
	readonly scheduledStartAt: Date;
	readonly missionName?: string | null;
	readonly plannedMethodId?: DomainId | null;
	readonly assignedToProfileId?: DomainId | null;
	readonly scheduledEndAt?: Date | null;
	readonly rainDate?: LocalDateString | null;
	readonly notificationTypeId?: DomainId | null;
	readonly items?: readonly MissionInitialItemInput[];
	readonly acknowledgedDuplicateRequestedActionMissioning?: boolean;
	readonly acknowledgedMethodMismatch?: boolean;
}

export type CreateMissionCommand = MissionDispatchDomainCommand<
	'missionDispatch.createMission',
	MissionDispatchCommandPayload & {
		readonly missionId: DomainId;
		readonly missionName: string | null;
		readonly controlType: ControlType;
		readonly plannedMethodId: DomainId | null;
		readonly assignedToProfileId: DomainId | null;
		readonly scheduledStartAt: Date;
		readonly scheduledEndAt: Date | null;
		readonly rainDate: LocalDateString | null;
		readonly notificationTypeId: DomainId | null;
		readonly items: readonly MissionInitialItem[];
		readonly acknowledgedDuplicateRequestedActionMissioning: boolean;
		readonly acknowledgedMethodMismatch: boolean;
	}
>;

export interface UpdateMissionDetailsCommandInput extends MissionDispatchCommandInput {
	readonly missionId: DomainId;
	readonly missionName?: string | null;
}

export type UpdateMissionDetailsCommand = MissionDispatchDomainCommand<
	'missionDispatch.updateMissionDetails',
	MissionDispatchCommandPayload & {
		readonly missionId: DomainId;
		readonly changes: Readonly<{ readonly missionName?: string | null }>;
	}
>;

export interface UpdateMissionScheduleCommandInput extends MissionDispatchCommandInput {
	readonly missionId: DomainId;
	readonly scheduledStartAt?: Date;
	readonly scheduledEndAt?: Date | null;
	readonly rainDate?: LocalDateString | null;
	readonly acknowledgedNotificationTimingChange?: boolean;
	readonly acknowledgedWorkedMissionScheduleChange?: boolean;
}

export type UpdateMissionScheduleCommand = MissionDispatchDomainCommand<
	'missionDispatch.updateMissionSchedule',
	MissionDispatchCommandPayload & {
		readonly missionId: DomainId;
		readonly changes: Readonly<{
			readonly scheduledStartAt?: Date;
			readonly scheduledEndAt?: Date | null;
			readonly rainDate?: LocalDateString | null;
		}>;
		readonly acknowledgedNotificationTimingChange: boolean;
		readonly acknowledgedWorkedMissionScheduleChange: boolean;
	}
>;

export interface UpdateMissionPlanCommandInput extends MissionDispatchCommandInput {
	readonly missionId: DomainId;
	readonly controlType?: ControlType;
	readonly plannedMethodId?: DomainId | null;
	readonly acknowledgedNotificationPlanChange?: boolean;
	readonly acknowledgedWorkedMissionPlanChange?: boolean;
}

export type UpdateMissionPlanCommand = MissionDispatchDomainCommand<
	'missionDispatch.updateMissionPlan',
	MissionDispatchCommandPayload & {
		readonly missionId: DomainId;
		readonly changes: Readonly<{
			readonly controlType?: ControlType;
			readonly plannedMethodId?: DomainId | null;
		}>;
		readonly acknowledgedNotificationPlanChange: boolean;
		readonly acknowledgedWorkedMissionPlanChange: boolean;
	}
>;

export interface AssignMissionCommandInput extends MissionDispatchCommandInput {
	readonly missionId: DomainId;
	readonly assignedToProfileId: DomainId | null;
	readonly acknowledgedInProgressAssignmentChange?: boolean;
}

export type AssignMissionCommand = MissionDispatchDomainCommand<
	'missionDispatch.assignMission',
	MissionDispatchCommandPayload & {
		readonly missionId: DomainId;
		readonly assignedToProfileId: DomainId | null;
		readonly acknowledgedInProgressAssignmentChange: boolean;
	}
>;

export interface UpdateMissionNotificationTypeCommandInput
	extends MissionDispatchCommandInput {
	readonly missionId: DomainId;
	readonly notificationTypeId: DomainId | null;
	readonly acknowledgedNotificationRegenerationImpact?: boolean;
}

export type UpdateMissionNotificationTypeCommand = MissionDispatchDomainCommand<
	'missionDispatch.updateMissionNotificationType',
	MissionDispatchCommandPayload & {
		readonly missionId: DomainId;
		readonly notificationTypeId: DomainId | null;
		readonly acknowledgedNotificationRegenerationImpact: boolean;
	}
>;

export interface MissionIdCommandInput extends MissionDispatchCommandInput {
	readonly missionId: DomainId;
}

export interface StartMissionCommandInput extends MissionIdCommandInput {
	readonly startedAt?: Date | null;
	readonly acknowledgedEarlyStart?: boolean;
}

export type StartMissionCommand = MissionDispatchDomainCommand<
	'missionDispatch.startMission',
	MissionDispatchCommandPayload & {
		readonly missionId: DomainId;
		readonly startedAt: Date | null;
		readonly acknowledgedEarlyStart: boolean;
	}
>;

export interface CompleteMissionCommandInput extends MissionIdCommandInput {
	readonly completedAt?: Date | null;
	readonly autoStartMission?: boolean;
}

export type CompleteMissionCommand = MissionDispatchDomainCommand<
	'missionDispatch.completeMission',
	MissionDispatchCommandPayload & {
		readonly missionId: DomainId;
		readonly completedAt: Date | null;
		readonly autoStartMission: boolean;
	}
>;

export interface CancelMissionCommandInput extends MissionIdCommandInput {
	readonly cancellationCommentId: DomainId;
	readonly cancellationReason: string;
	readonly cancelledAt?: Date | null;
	readonly acknowledgedProgressedMissionCancellation?: boolean;
	readonly acknowledgedPartialWorkCancellation?: boolean;
}

export type CancelMissionCommand = MissionDispatchDomainCommand<
	'missionDispatch.cancelMission',
	MissionDispatchCommandPayload & {
		readonly missionId: DomainId;
		readonly cancellationCommentId: DomainId;
		readonly cancellationReason: string;
		readonly cancelledAt: Date | null;
		readonly acknowledgedProgressedMissionCancellation: boolean;
		readonly acknowledgedPartialWorkCancellation: boolean;
	}
>;

export interface ReopenMissionCommandInput extends MissionIdCommandInput {
	readonly reopenCommentId: DomainId;
	readonly reopenReason: string;
	readonly reopenedAt?: Date | null;
}

export type ReopenMissionCommand = MissionDispatchDomainCommand<
	'missionDispatch.reopenMission',
	MissionDispatchCommandPayload & {
		readonly missionId: DomainId;
		readonly reopenCommentId: DomainId;
		readonly reopenReason: string;
		readonly reopenedAt: Date | null;
	}
>;

export interface DeleteMissionCommandInput extends MissionIdCommandInput {
	readonly acknowledgedMissionItemDeletion?: boolean;
	readonly acknowledgedActualActionDetach?: boolean;
	readonly acknowledgedNotificationDeletion?: boolean;
	readonly acknowledgedCompletedMissionDeletion?: boolean;
}

export type DeleteMissionCommand = MissionDispatchDomainCommand<
	'missionDispatch.deleteMission',
	MissionDispatchCommandPayload & {
		readonly missionId: DomainId;
		readonly acknowledgedMissionItemDeletion: boolean;
		readonly acknowledgedActualActionDetach: boolean;
		readonly acknowledgedNotificationDeletion: boolean;
		readonly acknowledgedCompletedMissionDeletion: boolean;
	}
>;

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
		readonly geometry: SupportedGeoJsonGeometry;
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

export interface UpdateMissionItemLocationAndLinkCommandInput
	extends MissionDispatchCommandInput {
	readonly missionItemId: DomainId;
	readonly geometry?: unknown;
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

interface MissionExecutionOptions {
	readonly completeMissionItem?: boolean;
	readonly autoStartMission?: boolean;
	readonly acknowledgedMissionGeometryNotCovered?: boolean;
	readonly acknowledgedMethodMismatch?: boolean;
	readonly acknowledgedRequestedActionMismatch?: boolean;
	readonly acknowledgedOutOfScheduleAction?: boolean;
	readonly acknowledgedCompletedItemAdditionalAction?: boolean;
}

interface MissionExecutionOverrides {
	readonly geometry?: unknown;
	readonly addressId?: DomainId | null;
	readonly requestedControlActionId?: DomainId | null;
	readonly context?: ControlActionContext;
	readonly metadata?: unknown | null;
}

type MissionExecutionPayload = {
	readonly completeMissionItem: boolean;
	readonly autoStartMission: boolean;
	readonly acknowledgedMissionGeometryNotCovered: boolean;
	readonly acknowledgedMethodMismatch: boolean;
	readonly acknowledgedRequestedActionMismatch: boolean;
	readonly acknowledgedOutOfScheduleAction: boolean;
	readonly acknowledgedCompletedItemAdditionalAction: boolean;
	readonly geometry?: SupportedGeoJsonGeometry;
	readonly addressId?: DomainId | null;
	readonly requestedControlActionId?: DomainId | null;
	readonly context?: ControlActionContext;
	readonly metadata: JsonObject | null;
};

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
			readonly applicatorProfileId: DomainId | null;
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
			readonly technicianProfileId: DomainId | null;
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
			readonly technicianProfileId: DomainId | null;
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
			readonly technicianProfileId: DomainId | null;
		}
>;

export type MissionDispatchCommand =
	| CreateMissionCommand
	| UpdateMissionDetailsCommand
	| UpdateMissionScheduleCommand
	| UpdateMissionPlanCommand
	| AssignMissionCommand
	| UpdateMissionNotificationTypeCommand
	| StartMissionCommand
	| CompleteMissionCommand
	| CancelMissionCommand
	| ReopenMissionCommand
	| DeleteMissionCommand
	| AddMissionItemCommand
	| AddMissionItemFromRequestedControlActionCommand
	| UpdateMissionItemLocationAndLinkCommand
	| RemoveMissionItemCommand
	| MoveMissionItemsCommand
	| CompleteMissionItemCommand
	| ReopenMissionItemCommand
	| SkipMissionItemCommand
	| UnskipMissionItemCommand
	| RecordChemicalApplicationForMissionItemCommand
	| RecordSourceReductionForMissionItemCommand
	| RecordOutreachActionForMissionItemCommand
	| RecordBiocontrolActionForMissionItemCommand;

const CONTROL_TYPES = ['application', 'source_reduction', 'biocontrol', 'outreach'] as const;

export function deriveMissionLifecycleStatus(input: {
	readonly startedAt?: Date | string | null;
	readonly completedAt?: Date | string | null;
	readonly cancelledAt?: Date | string | null;
	readonly deletedAt?: Date | string | null;
}): MissionLifecycleStatus {
	if (input.deletedAt != null) {
		return 'deleted';
	}
	if (input.completedAt != null) {
		return 'completed';
	}
	if (input.cancelledAt != null) {
		return 'cancelled';
	}
	if (input.startedAt != null) {
		return 'inProgress';
	}
	return 'scheduled';
}

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

export function createMissionCommand(input: CreateMissionCommandInput): CreateMissionCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.missionId, 'missionId', issues);
	const controlType = normalizeStringUnion(input.controlType, CONTROL_TYPES, 'controlType', issues);
	const scheduledStartAt = normalizeTimestamp(input.scheduledStartAt, 'scheduledStartAt', issues, true);
	const scheduledEndAt = normalizeOptionalTimestamp(
		input.scheduledEndAt,
		'scheduledEndAt',
		issues,
		true,
	);
	validateTimestampOrder(scheduledStartAt, scheduledEndAt, 'scheduledEndAt', issues);
	const rainDate = normalizeOptionalLocalDate(input.rainDate, 'rainDate', issues);
	const missionName = normalizeNullableText(input.missionName, 'missionName', issues, 200);
	const plannedMethodId = normalizeOptionalUuid(input.plannedMethodId, 'plannedMethodId', issues);
	const assignedToProfileId = normalizeOptionalUuid(
		input.assignedToProfileId,
		'assignedToProfileId',
		issues,
	);
	const notificationTypeId = normalizeOptionalUuid(
		input.notificationTypeId,
		'notificationTypeId',
		issues,
	);
	const items = validateInitialItems(input.items ?? [], issues);
	throwIfIssues('Create mission command is invalid.', issues);

	return {
		type: 'missionDispatch.createMission',
		payload: {
			...basePayload(input),
			missionId: normalizeRequiredId(input.missionId),
			missionName,
			controlType,
			plannedMethodId,
			assignedToProfileId,
			scheduledStartAt,
			scheduledEndAt,
			rainDate,
			notificationTypeId,
			items,
			acknowledgedDuplicateRequestedActionMissioning:
				input.acknowledgedDuplicateRequestedActionMissioning ?? false,
			acknowledgedMethodMismatch: input.acknowledgedMethodMismatch ?? false,
		},
	};
}

export function updateMissionDetailsCommand(
	input: UpdateMissionDetailsCommandInput,
): UpdateMissionDetailsCommand {
	const issues = validateIdCommand(input, 'missionId');
	const hasName = input.missionName !== undefined;
	if (!hasName) {
		issues.push({ path: 'changes', message: 'At least one mission detail must change.' });
	}
	const missionName = hasName
		? normalizeNullableText(input.missionName, 'missionName', issues, 200)
		: undefined;
	throwIfIssues('Update mission details command is invalid.', issues);
	return {
		type: 'missionDispatch.updateMissionDetails',
		payload: {
			...basePayload(input),
			missionId: normalizeRequiredId(input.missionId),
			changes: { ...(hasName ? { missionName: missionName ?? null } : {}) },
		},
	};
}

export function updateMissionScheduleCommand(
	input: UpdateMissionScheduleCommandInput,
): UpdateMissionScheduleCommand {
	const issues = validateIdCommand(input, 'missionId');
	const hasStart = input.scheduledStartAt !== undefined;
	const hasEnd = input.scheduledEndAt !== undefined;
	const hasRain = input.rainDate !== undefined;
	if (!hasStart && !hasEnd && !hasRain) {
		issues.push({ path: 'changes', message: 'At least one mission schedule field must change.' });
	}
	const scheduledStartAt = hasStart
		? normalizeTimestamp(input.scheduledStartAt, 'scheduledStartAt', issues, true)
		: undefined;
	const scheduledEndAt = hasEnd
		? normalizeOptionalTimestamp(input.scheduledEndAt, 'scheduledEndAt', issues, true)
		: undefined;
	if (scheduledStartAt !== undefined && scheduledEndAt !== undefined) {
		validateTimestampOrder(scheduledStartAt, scheduledEndAt, 'scheduledEndAt', issues);
	}
	const rainDate = hasRain ? normalizeOptionalLocalDate(input.rainDate, 'rainDate', issues) : undefined;
	throwIfIssues('Update mission schedule command is invalid.', issues);
	const changes: UpdateMissionScheduleCommand['payload']['changes'] = {
		...(hasStart && scheduledStartAt !== undefined ? { scheduledStartAt } : {}),
		...(hasEnd ? { scheduledEndAt: scheduledEndAt ?? null } : {}),
		...(hasRain ? { rainDate: rainDate ?? null } : {}),
	};
	return {
		type: 'missionDispatch.updateMissionSchedule',
		payload: {
			...basePayload(input),
			missionId: normalizeRequiredId(input.missionId),
			changes,
			acknowledgedNotificationTimingChange: input.acknowledgedNotificationTimingChange ?? false,
			acknowledgedWorkedMissionScheduleChange:
				input.acknowledgedWorkedMissionScheduleChange ?? false,
		},
	};
}

export function updateMissionPlanCommand(
	input: UpdateMissionPlanCommandInput,
): UpdateMissionPlanCommand {
	const issues = validateIdCommand(input, 'missionId');
	const hasControlType = input.controlType !== undefined;
	const hasMethod = input.plannedMethodId !== undefined;
	if (!hasControlType && !hasMethod) {
		issues.push({ path: 'changes', message: 'At least one mission plan field must change.' });
	}
	const controlType = hasControlType
		? normalizeStringUnion(input.controlType, CONTROL_TYPES, 'controlType', issues)
		: undefined;
	const plannedMethodId = hasMethod
		? normalizeOptionalUuid(input.plannedMethodId, 'plannedMethodId', issues)
		: undefined;
	throwIfIssues('Update mission plan command is invalid.', issues);
	const changes: UpdateMissionPlanCommand['payload']['changes'] = {
		...(hasControlType && controlType !== undefined ? { controlType } : {}),
		...(hasMethod ? { plannedMethodId: plannedMethodId ?? null } : {}),
	};
	return {
		type: 'missionDispatch.updateMissionPlan',
		payload: {
			...basePayload(input),
			missionId: normalizeRequiredId(input.missionId),
			changes,
			acknowledgedNotificationPlanChange: input.acknowledgedNotificationPlanChange ?? false,
			acknowledgedWorkedMissionPlanChange: input.acknowledgedWorkedMissionPlanChange ?? false,
		},
	};
}

export function assignMissionCommand(input: AssignMissionCommandInput): AssignMissionCommand {
	const issues = validateIdCommand(input, 'missionId');
	const assignedToProfileId = normalizeOptionalUuid(
		input.assignedToProfileId,
		'assignedToProfileId',
		issues,
	);
	throwIfIssues('Assign mission command is invalid.', issues);
	return {
		type: 'missionDispatch.assignMission',
		payload: {
			...basePayload(input),
			missionId: normalizeRequiredId(input.missionId),
			assignedToProfileId,
			acknowledgedInProgressAssignmentChange:
				input.acknowledgedInProgressAssignmentChange ?? false,
		},
	};
}

export function updateMissionNotificationTypeCommand(
	input: UpdateMissionNotificationTypeCommandInput,
): UpdateMissionNotificationTypeCommand {
	const issues = validateIdCommand(input, 'missionId');
	const notificationTypeId = normalizeOptionalUuid(
		input.notificationTypeId,
		'notificationTypeId',
		issues,
	);
	throwIfIssues('Update mission notification type command is invalid.', issues);
	return {
		type: 'missionDispatch.updateMissionNotificationType',
		payload: {
			...basePayload(input),
			missionId: normalizeRequiredId(input.missionId),
			notificationTypeId,
			acknowledgedNotificationRegenerationImpact:
				input.acknowledgedNotificationRegenerationImpact ?? false,
		},
	};
}

export function startMissionCommand(input: StartMissionCommandInput): StartMissionCommand {
	const issues = validateIdCommand(input, 'missionId');
	const startedAt = normalizeOptionalTimestamp(input.startedAt, 'startedAt', issues, false);
	throwIfIssues('Start mission command is invalid.', issues);
	return {
		type: 'missionDispatch.startMission',
		payload: {
			...basePayload(input),
			missionId: normalizeRequiredId(input.missionId),
			startedAt,
			acknowledgedEarlyStart: input.acknowledgedEarlyStart ?? false,
		},
	};
}

export function completeMissionCommand(
	input: CompleteMissionCommandInput,
): CompleteMissionCommand {
	const issues = validateIdCommand(input, 'missionId');
	const completedAt = normalizeOptionalTimestamp(input.completedAt, 'completedAt', issues, false);
	throwIfIssues('Complete mission command is invalid.', issues);
	return {
		type: 'missionDispatch.completeMission',
		payload: {
			...basePayload(input),
			missionId: normalizeRequiredId(input.missionId),
			completedAt,
			autoStartMission: input.autoStartMission ?? true,
		},
	};
}

export function cancelMissionCommand(input: CancelMissionCommandInput): CancelMissionCommand {
	const issues = validateIdCommand(input, 'missionId');
	requireUuid(input.cancellationCommentId, 'cancellationCommentId', issues);
	const cancellationReason = normalizeRequiredText(
		input.cancellationReason,
		'cancellationReason',
		issues,
		2_000,
	);
	const cancelledAt = normalizeOptionalTimestamp(input.cancelledAt, 'cancelledAt', issues, false);
	throwIfIssues('Cancel mission command is invalid.', issues);
	return {
		type: 'missionDispatch.cancelMission',
		payload: {
			...basePayload(input),
			missionId: normalizeRequiredId(input.missionId),
			cancellationCommentId: normalizeRequiredId(input.cancellationCommentId),
			cancellationReason,
			cancelledAt,
			acknowledgedProgressedMissionCancellation:
				input.acknowledgedProgressedMissionCancellation ?? false,
			acknowledgedPartialWorkCancellation: input.acknowledgedPartialWorkCancellation ?? false,
		},
	};
}

export function reopenMissionCommand(input: ReopenMissionCommandInput): ReopenMissionCommand {
	const issues = validateIdCommand(input, 'missionId');
	requireUuid(input.reopenCommentId, 'reopenCommentId', issues);
	const reopenReason = normalizeRequiredText(input.reopenReason, 'reopenReason', issues, 2_000);
	const reopenedAt = normalizeOptionalTimestamp(input.reopenedAt, 'reopenedAt', issues, false);
	throwIfIssues('Reopen mission command is invalid.', issues);
	return {
		type: 'missionDispatch.reopenMission',
		payload: {
			...basePayload(input),
			missionId: normalizeRequiredId(input.missionId),
			reopenCommentId: normalizeRequiredId(input.reopenCommentId),
			reopenReason,
			reopenedAt,
		},
	};
}

export function deleteMissionCommand(input: DeleteMissionCommandInput): DeleteMissionCommand {
	const issues = validateIdCommand(input, 'missionId');
	throwIfIssues('Delete mission command is invalid.', issues);
	return {
		type: 'missionDispatch.deleteMission',
		payload: {
			...basePayload(input),
			missionId: normalizeRequiredId(input.missionId),
			acknowledgedMissionItemDeletion: input.acknowledgedMissionItemDeletion ?? false,
			acknowledgedActualActionDetach: input.acknowledgedActualActionDetach ?? false,
			acknowledgedNotificationDeletion: input.acknowledgedNotificationDeletion ?? false,
			acknowledgedCompletedMissionDeletion:
				input.acknowledgedCompletedMissionDeletion ?? false,
		},
	};
}

export function addMissionItemCommand(input: AddMissionItemCommandInput): AddMissionItemCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.missionItemId, 'missionItemId', issues);
	requireUuid(input.missionId, 'missionId', issues);
	const geometry = validateLocatableGeometry(input.geometry, 'geometry', issues);
	const addressId = normalizeOptionalUuid(input.addressId, 'addressId', issues);
	const requestedControlActionId = normalizeOptionalUuid(
		input.requestedControlActionId,
		'requestedControlActionId',
		issues,
	);
	const placement = validateMissionItemPlacement(input.placement ?? { kind: 'end' }, 'placement', issues);
	throwIfIssues('Add mission item command is invalid.', issues);
	return {
		type: 'missionDispatch.addMissionItem',
		payload: {
			...basePayload(input),
			missionItemId: normalizeRequiredId(input.missionItemId),
			missionId: normalizeRequiredId(input.missionId),
			geometry,
			addressId,
			requestedControlActionId,
			placement,
			acknowledgedDuplicateRequestedActionMissioning:
				input.acknowledgedDuplicateRequestedActionMissioning ?? false,
			acknowledgedMethodMismatch: input.acknowledgedMethodMismatch ?? false,
			acknowledgedInProgressMissionChange: input.acknowledgedInProgressMissionChange ?? false,
			acknowledgedNotificationGeometryChange:
				input.acknowledgedNotificationGeometryChange ?? false,
		},
	};
}

export function addMissionItemFromRequestedControlActionCommand(
	input: AddMissionItemFromRequestedControlActionCommandInput,
): AddMissionItemFromRequestedControlActionCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.missionItemId, 'missionItemId', issues);
	requireUuid(input.missionId, 'missionId', issues);
	requireUuid(input.requestedControlActionId, 'requestedControlActionId', issues);
	const placement = validateMissionItemPlacement(input.placement ?? { kind: 'end' }, 'placement', issues);
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
			acknowledgedNotificationGeometryChange:
				input.acknowledgedNotificationGeometryChange ?? false,
		},
	};
}

export function updateMissionItemLocationAndLinkCommand(
	input: UpdateMissionItemLocationAndLinkCommandInput,
): UpdateMissionItemLocationAndLinkCommand {
	const issues = validateIdCommand(input, 'missionItemId');
	const hasGeometry = input.geometry !== undefined;
	const hasAddress = input.addressId !== undefined;
	const hasRequested = input.requestedControlActionId !== undefined;
	if (!hasGeometry && !hasAddress && !hasRequested) {
		issues.push({
			path: 'changes',
			message: 'At least one mission item location or link field must change.',
		});
	}
	const geometry = hasGeometry ? validateLocatableGeometry(input.geometry, 'geometry', issues) : undefined;
	const addressId = hasAddress
		? normalizeOptionalUuid(input.addressId, 'addressId', issues)
		: undefined;
	const requestedControlActionId = hasRequested
		? normalizeOptionalUuid(input.requestedControlActionId, 'requestedControlActionId', issues)
		: undefined;
	throwIfIssues('Update mission item location and link command is invalid.', issues);
	const changes: UpdateMissionItemLocationAndLinkCommand['payload']['changes'] = {
		...(hasGeometry && geometry !== undefined ? { geometry } : {}),
		...(hasAddress ? { addressId: addressId ?? null } : {}),
		...(hasRequested ? { requestedControlActionId: requestedControlActionId ?? null } : {}),
	};
	return {
		type: 'missionDispatch.updateMissionItemLocationAndLink',
		payload: {
			...basePayload(input),
			missionItemId: normalizeRequiredId(input.missionItemId),
			changes,
			acknowledgedNotificationGeometryChange:
				input.acknowledgedNotificationGeometryChange ?? false,
			acknowledgedActualActionContextChange:
				input.acknowledgedActualActionContextChange ?? false,
			acknowledgedProgressedItemLinkChange:
				input.acknowledgedProgressedItemLinkChange ?? false,
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
			acknowledgedNotificationGeometryChange:
				input.acknowledgedNotificationGeometryChange ?? false,
		},
	};
}

export function moveMissionItemsCommand(input: MoveMissionItemsCommandInput): MoveMissionItemsCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.missionId, 'missionId', issues);
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
	const issues = validateMissionExecutionBase(input, 'chemicalApplication');
	requireUuid(input.applicationId, 'applicationId', issues);
	requireUuid(input.insecticideId, 'insecticideId', issues);
	requireUuid(input.applicationUnitId, 'applicationUnitId', issues);
	normalizeOptionalUuid(input.applicatorProfileId, 'applicatorProfileId', issues);
	normalizeOptionalUuid(input.applicationMethodId, 'applicationMethodId', issues);
	normalizeOptionalUuid(input.vehicleId, 'vehicleId', issues);
	normalizeOptionalUuid(input.equipmentId, 'equipmentId', issues);
	validateLocalDate(input.applicationDate, 'applicationDate', issues);
	const amountApplied = normalizePositiveFiniteNumber(input.amountApplied, 'amountApplied', issues);
	const applicationBatches = validateApplicationBatches(input.applicationBatches ?? [], issues);
	throwIfIssues('Record chemical application for mission item command is invalid.', issues);
	return {
		type: 'missionDispatch.recordChemicalApplicationForMissionItem',
		payload: {
			...basePayload(input),
			...missionExecutionPayload(input, 'chemicalApplication', issues),
			missionItemId: normalizeRequiredId(input.missionItemId),
			applicationId: normalizeRequiredId(input.applicationId),
			insecticideId: normalizeRequiredId(input.insecticideId),
			amountApplied,
			applicationUnitId: normalizeRequiredId(input.applicationUnitId),
			applicationDate: input.applicationDate,
			applicatorProfileId: normalizeOptionalUuid(
				input.applicatorProfileId,
				'applicatorProfileId',
				issues,
			),
			applicationMethodId: normalizeOptionalUuid(
				input.applicationMethodId,
				'applicationMethodId',
				issues,
			),
			vehicleId: normalizeOptionalUuid(input.vehicleId, 'vehicleId', issues),
			equipmentId: normalizeOptionalUuid(input.equipmentId, 'equipmentId', issues),
			applicationBatches,
		},
	};
}

export function recordSourceReductionForMissionItemCommand(
	input: RecordSourceReductionForMissionItemCommandInput,
): RecordSourceReductionForMissionItemCommand {
	const issues = validateMissionExecutionBase(input, 'sourceReduction');
	requireUuid(input.sourceReductionId, 'sourceReductionId', issues);
	requireUuid(input.sourcesEliminatedUnitId, 'sourcesEliminatedUnitId', issues);
	normalizeOptionalUuid(input.sourceReductionMethodId, 'sourceReductionMethodId', issues);
	normalizeOptionalUuid(input.technicianProfileId, 'technicianProfileId', issues);
	validateLocalDate(input.sourceReductionDate, 'sourceReductionDate', issues);
	const sourcesEliminatedAmount = normalizePositiveFiniteNumber(
		input.sourcesEliminatedAmount,
		'sourcesEliminatedAmount',
		issues,
	);
	throwIfIssues('Record source reduction for mission item command is invalid.', issues);
	return {
		type: 'missionDispatch.recordSourceReductionForMissionItem',
		payload: {
			...basePayload(input),
			...missionExecutionPayload(input, 'sourceReduction', issues),
			missionItemId: normalizeRequiredId(input.missionItemId),
			sourceReductionId: normalizeRequiredId(input.sourceReductionId),
			sourceReductionDate: input.sourceReductionDate,
			sourcesEliminatedAmount,
			sourcesEliminatedUnitId: normalizeRequiredId(input.sourcesEliminatedUnitId),
			sourceReductionMethodId: normalizeOptionalUuid(
				input.sourceReductionMethodId,
				'sourceReductionMethodId',
				issues,
			),
			technicianProfileId: normalizeOptionalUuid(
				input.technicianProfileId,
				'technicianProfileId',
				issues,
			),
		},
	};
}

export function recordOutreachActionForMissionItemCommand(
	input: RecordOutreachActionForMissionItemCommandInput,
): RecordOutreachActionForMissionItemCommand {
	const issues = validateMissionExecutionBase(input, 'outreach');
	requireUuid(input.outreachActionId, 'outreachActionId', issues);
	normalizeOptionalUuid(input.outreachMethodId, 'outreachMethodId', issues);
	normalizeOptionalUuid(input.technicianProfileId, 'technicianProfileId', issues);
	validateLocalDate(input.outreachDate, 'outreachDate', issues);
	const reach = normalizePositiveInteger(input.reach, 'reach', issues);
	const reachDescription = normalizeNullableText(
		input.reachDescription,
		'reachDescription',
		issues,
		2_000,
	);
	throwIfIssues('Record outreach action for mission item command is invalid.', issues);
	return {
		type: 'missionDispatch.recordOutreachActionForMissionItem',
		payload: {
			...basePayload(input),
			...missionExecutionPayload(input, 'outreach', issues),
			missionItemId: normalizeRequiredId(input.missionItemId),
			outreachActionId: normalizeRequiredId(input.outreachActionId),
			outreachDate: input.outreachDate,
			reach,
			outreachMethodId: normalizeOptionalUuid(
				input.outreachMethodId,
				'outreachMethodId',
				issues,
			),
			technicianProfileId: normalizeOptionalUuid(
				input.technicianProfileId,
				'technicianProfileId',
				issues,
			),
			reachDescription,
		},
	};
}

export function recordBiocontrolActionForMissionItemCommand(
	input: RecordBiocontrolActionForMissionItemCommandInput,
): RecordBiocontrolActionForMissionItemCommand {
	const issues = validateMissionExecutionBase(input, 'biocontrol');
	requireUuid(input.biocontrolActionId, 'biocontrolActionId', issues);
	requireUuid(input.releaseUnitId, 'releaseUnitId', issues);
	normalizeOptionalUuid(input.biocontrolMethodId, 'biocontrolMethodId', issues);
	normalizeOptionalUuid(input.technicianProfileId, 'technicianProfileId', issues);
	validateLocalDate(input.biocontrolDate, 'biocontrolDate', issues);
	const amountReleased = normalizePositiveFiniteNumber(
		input.amountReleased,
		'amountReleased',
		issues,
	);
	throwIfIssues('Record biocontrol action for mission item command is invalid.', issues);
	return {
		type: 'missionDispatch.recordBiocontrolActionForMissionItem',
		payload: {
			...basePayload(input),
			...missionExecutionPayload(input, 'biocontrol', issues),
			missionItemId: normalizeRequiredId(input.missionItemId),
			biocontrolActionId: normalizeRequiredId(input.biocontrolActionId),
			biocontrolDate: input.biocontrolDate,
			amountReleased,
			releaseUnitId: normalizeRequiredId(input.releaseUnitId),
			biocontrolMethodId: normalizeOptionalUuid(
				input.biocontrolMethodId,
				'biocontrolMethodId',
				issues,
			),
			technicianProfileId: normalizeOptionalUuid(
				input.technicianProfileId,
				'technicianProfileId',
				issues,
			),
		},
	};
}

function validateInitialItems(
	values: readonly MissionInitialItemInput[],
	issues: DomainValidationIssue[],
): readonly MissionInitialItem[] {
	if (!Array.isArray(values)) {
		issues.push({ path: 'items', message: 'items must be an array.' });
		return [];
	}
	const itemIds = new Set<string>();
	return values.map((item, index) => {
		const path = `items.${index}`;
		if (item?.kind === 'explicit') {
			requireUuid(item.missionItemId, `${path}.missionItemId`, issues);
			const missionItemId = normalizeRequiredId(item.missionItemId);
			if (itemIds.has(missionItemId)) {
				issues.push({ path: `${path}.missionItemId`, message: 'missionItemId values must be unique.' });
			}
			itemIds.add(missionItemId);
			return {
				kind: 'explicit',
				missionItemId,
				geometry: validateLocatableGeometry(item.geometry, `${path}.geometry`, issues),
				addressId: normalizeOptionalUuid(item.addressId, `${path}.addressId`, issues),
				requestedControlActionId: normalizeOptionalUuid(
					item.requestedControlActionId,
					`${path}.requestedControlActionId`,
					issues,
				),
			};
		}
		if (item?.kind === 'fromRequestedControlAction') {
			requireUuid(item.missionItemId, `${path}.missionItemId`, issues);
			requireUuid(item.requestedControlActionId, `${path}.requestedControlActionId`, issues);
			const missionItemId = normalizeRequiredId(item.missionItemId);
			if (itemIds.has(missionItemId)) {
				issues.push({ path: `${path}.missionItemId`, message: 'missionItemId values must be unique.' });
			}
			itemIds.add(missionItemId);
			return {
				kind: 'fromRequestedControlAction',
				missionItemId,
				requestedControlActionId: normalizeRequiredId(item.requestedControlActionId),
			};
		}
		issues.push({ path: `${path}.kind`, message: 'Mission item kind is not supported.' });
		return {
			kind: 'fromRequestedControlAction',
			missionItemId: '',
			requestedControlActionId: '',
		};
	});
}

function validateMissionExecutionBase(
	input: MissionDispatchCommandInput & MissionExecutionOptions & MissionExecutionOverrides & { readonly missionItemId: DomainId },
	allowedFor: 'chemicalApplication' | 'sourceReduction' | 'outreach' | 'biocontrol',
): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.missionItemId, 'missionItemId', issues);
	if (input.geometry !== undefined) {
		validateLocatableGeometry(input.geometry, 'geometry', issues);
	}
	if (input.addressId !== undefined) {
		normalizeOptionalUuid(input.addressId, 'addressId', issues);
	}
	if (input.requestedControlActionId !== undefined) {
		normalizeOptionalUuid(input.requestedControlActionId, 'requestedControlActionId', issues);
	}
	if (input.context !== undefined) {
		validateContext(input.context, allowedFor, issues);
	}
	normalizeMetadata(input.metadata, 'metadata', issues);
	return issues;
}

function missionExecutionPayload(
	input: MissionExecutionOptions & MissionExecutionOverrides,
	allowedFor: 'chemicalApplication' | 'sourceReduction' | 'outreach' | 'biocontrol',
	issues: DomainValidationIssue[],
): MissionExecutionPayload {
	return {
		completeMissionItem: input.completeMissionItem ?? true,
		autoStartMission: input.autoStartMission ?? true,
		acknowledgedMissionGeometryNotCovered:
			input.acknowledgedMissionGeometryNotCovered ?? false,
		acknowledgedMethodMismatch: input.acknowledgedMethodMismatch ?? false,
		acknowledgedRequestedActionMismatch: input.acknowledgedRequestedActionMismatch ?? false,
		acknowledgedOutOfScheduleAction: input.acknowledgedOutOfScheduleAction ?? false,
		acknowledgedCompletedItemAdditionalAction:
			input.acknowledgedCompletedItemAdditionalAction ?? false,
		...(input.geometry !== undefined
			? { geometry: validateLocatableGeometry(input.geometry, 'geometry', issues) }
			: {}),
		...(input.addressId !== undefined
			? { addressId: normalizeOptionalUuid(input.addressId, 'addressId', issues) }
			: {}),
		...(input.requestedControlActionId !== undefined
			? {
					requestedControlActionId: normalizeOptionalUuid(
						input.requestedControlActionId,
						'requestedControlActionId',
						issues,
					),
				}
			: {}),
		...(input.context !== undefined ? { context: validateContext(input.context, allowedFor, issues) } : {}),
		metadata: normalizeMetadata(input.metadata, 'metadata', issues),
	};
}

function validateContext(
	context: ControlActionContext,
	allowedFor: 'chemicalApplication' | 'sourceReduction' | 'outreach' | 'biocontrol',
	issues: DomainValidationIssue[],
): ControlActionContext {
	if (context?.kind === 'none') {
		return { kind: 'none' };
	}
	if (context?.kind === 'adult') {
		requireUuid(context.collectionId, 'context.collectionId', issues);
		if (allowedFor !== 'chemicalApplication') {
			issues.push({ path: 'context.kind', message: 'Adult collection context is not allowed here.' });
		}
		return { kind: 'adult', collectionId: normalizeRequiredId(context.collectionId) };
	}
	if (context?.kind === 'larval') {
		const hasHabitat =
			context.habitatId !== undefined && normalizeOptionalId(context.habitatId) !== null;
		const hasInspection =
			context.inspectionId !== undefined && normalizeOptionalId(context.inspectionId) !== null;
		if (!hasHabitat && !hasInspection) {
			issues.push({ path: 'context', message: 'Larval context requires habitatId or inspectionId.' });
		}
		if (hasHabitat) {
			requireUuid(context.habitatId, 'context.habitatId', issues);
		}
		if (hasInspection) {
			requireUuid(context.inspectionId, 'context.inspectionId', issues);
		}
		if (allowedFor === 'outreach') {
			if (hasHabitat) {
				issues.push({
					path: 'context.habitatId',
					message: 'Outreach context cannot reference a habitat directly.',
				});
			}
			if (!hasInspection) {
				issues.push({
					path: 'context.inspectionId',
					message: 'Outreach larval context requires inspectionId.',
				});
			}
		}
		return {
			kind: 'larval',
			...(hasHabitat ? { habitatId: normalizeRequiredId(context.habitatId) } : {}),
			...(hasInspection ? { inspectionId: normalizeRequiredId(context.inspectionId) } : {}),
		};
	}
	issues.push({ path: 'context.kind', message: 'context.kind is not supported.' });
	return { kind: 'none' };
}

function validateApplicationBatches(
	values: readonly ApplicationBatchInput[],
	issues: DomainValidationIssue[],
): readonly ApplicationBatchInput[] {
	if (!Array.isArray(values)) {
		issues.push({ path: 'applicationBatches', message: 'applicationBatches must be an array.' });
		return [];
	}
	const applicationBatchIds = new Set<string>();
	const insecticideBatchIds = new Set<string>();
	return values.map((value, index) => {
		requireUuid(value.applicationBatchId, `applicationBatches.${index}.applicationBatchId`, issues);
		requireUuid(value.insecticideBatchId, `applicationBatches.${index}.insecticideBatchId`, issues);
		const applicationBatchId = normalizeRequiredId(value.applicationBatchId);
		const insecticideBatchId = normalizeRequiredId(value.insecticideBatchId);
		if (applicationBatchIds.has(applicationBatchId)) {
			issues.push({
				path: `applicationBatches.${index}.applicationBatchId`,
				message: 'applicationBatchId values must be unique.',
			});
		}
		if (insecticideBatchIds.has(insecticideBatchId)) {
			issues.push({
				path: `applicationBatches.${index}.insecticideBatchId`,
				message: 'insecticideBatchId values must be unique.',
			});
		}
		applicationBatchIds.add(applicationBatchId);
		insecticideBatchIds.add(insecticideBatchId);
		return { applicationBatchId, insecticideBatchId };
	});
}

function validateMissionItemPlacement(
	placement: MissionItemPlacement | undefined,
	path: string,
	issues: DomainValidationIssue[],
): MissionItemPlacement {
	if (placement === undefined || !['start', 'end', 'before', 'after'].includes(placement.kind)) {
		issues.push({ path, message: 'placement is not supported.' });
		return { kind: 'end' };
	}
	if (placement.kind === 'before' || placement.kind === 'after') {
		requireUuid(placement.missionItemId, `${path}.missionItemId`, issues);
		return { kind: placement.kind, missionItemId: normalizeRequiredId(placement.missionItemId) };
	}
	return { kind: placement.kind };
}

function validateIdList(
	values: readonly DomainId[],
	path: string,
	issues: DomainValidationIssue[],
): readonly DomainId[] {
	if (!Array.isArray(values) || values.length === 0) {
		issues.push({ path, message: `${path} must include at least one id.` });
		return [];
	}
	const seen = new Set<string>();
	return values.map((value, index) => {
		requireUuid(value, `${path}.${index}`, issues);
		const normalized = normalizeRequiredId(value);
		if (seen.has(normalized)) {
			issues.push({ path: `${path}.${index}`, message: `${path} must not contain duplicates.` });
		}
		seen.add(normalized);
		return normalized;
	});
}

function validateBase(input: MissionDispatchCommandInput, issues: DomainValidationIssue[]): void {
	requireUuid(input.organizationId, 'organizationId', issues);
	requireUuid(input.actorProfileId, 'actorProfileId', issues);
}

function validateIdCommand<T extends MissionDispatchCommandInput>(
	input: T,
	idKey: keyof T & string,
): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input[idKey] as string | undefined, idKey, issues);
	return issues;
}

function basePayload(input: MissionDispatchCommandInput): MissionDispatchCommandPayload {
	return {
		organizationId: normalizeRequiredId(input.organizationId),
		actorProfileId: normalizeRequiredId(input.actorProfileId),
	};
}

function validateLocatableGeometry(
	value: unknown,
	path: string,
	issues: DomainValidationIssue[],
): SupportedGeoJsonGeometry {
	try {
		return normalizeLocatableGeometry(value, path);
	} catch (error) {
		if (error instanceof DomainValidationError) {
			issues.push(...error.issues);
			return { type: 'Point', coordinates: [0, 0] };
		}
		throw error;
	}
}

function validateTimestampOrder(
	start: Date | undefined,
	end: Date | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): void {
	if (start !== undefined && end != null && end.getTime() <= start.getTime()) {
		issues.push({ path, message: `${path} must be after scheduledStartAt.` });
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
	}
}

function normalizeOptionalLocalDate(
	value: LocalDateString | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): LocalDateString | null {
	if (value === undefined || value === null) {
		return null;
	}
	validateLocalDate(value, path, issues);
	return value;
}

function normalizeTimestamp(
	value: Date | undefined,
	path: string,
	issues: DomainValidationIssue[],
	allowFuture: boolean,
): Date {
	if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
		issues.push({ path, message: `${path} must be a valid Date.` });
		return new Date(0);
	}
	if (!allowFuture && value.getTime() > Date.now()) {
		issues.push({ path, message: `${path} cannot be in the future.` });
	}
	return value;
}

function normalizeOptionalTimestamp(
	value: Date | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
	allowFuture: boolean,
): Date | null {
	if (value === undefined || value === null) {
		return null;
	}
	return normalizeTimestamp(value, path, issues, allowFuture);
}

function normalizePositiveFiniteNumber(
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

function normalizePositiveInteger(
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

function normalizeRequiredText(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
	maxLength: number,
): string {
	const normalized = normalizeNullableText(value, path, issues, maxLength);
	if (normalized === null) {
		issues.push({ path, message: `${path} is required.` });
		return '';
	}
	return normalized;
}

function normalizeNullableText(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
	maxLength: number,
): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return null;
	}
	if (trimmed.length > maxLength) {
		issues.push({ path, message: `${path} must be ${maxLength} characters or fewer.` });
	}
	return trimmed;
}

function normalizeStringUnion<TValue extends string>(
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

function normalizeRequiredId(value: string | null | undefined): string {
	return normalizeOptionalId(value) ?? '';
}

function normalizeOptionalId(value: string | null | undefined): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
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
