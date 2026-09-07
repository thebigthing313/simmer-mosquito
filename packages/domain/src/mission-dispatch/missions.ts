import { CONTROL_TYPES, type ControlType } from '../column-vocabularies.js';
import {
	basePayload,
	createIssues,
	nullableText as normalizeNullableText,
	normalizeOptionalTimestamp,
	optionalUuid as normalizeOptionalUuid,
	requiredId as normalizeRequiredId,
	requiredText as normalizeRequiredText,
	normalizeStringUnion,
	requiredUuid as requireUuid,
	throwIfIssues,
	validateBase,
	validateIdCommand,
} from '../command-validation.js';
import type { DomainId, LocalDateString } from '../shared.js';
import {
	normalizeUpdateFields,
	nullableReferenceIdField,
	nullableTextField,
	stringUnionField,
	timestampField,
	type UpdateFieldNormalizer,
	type UpdateFieldSet,
	type UpdateFieldsChanges,
	type UpdateFieldsInput,
	updateFieldsCommand,
} from '../update-command-fields.js';
import {
	type MissionDispatchCommandInput,
	type MissionDispatchCommandPayload,
	type MissionDispatchDomainCommand,
	type MissionInitialItem,
	type MissionInitialItemInput,
	type MissionLifecycleStatus,
	normalizeOptionalLocalDate,
	normalizeTimestamp,
	validateInitialItems,
	validateTimestampOrder,
} from './shared.js';

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

export const MISSION_DETAILS_UPDATE_FIELDS = {
	missionName: nullableTextField(200),
} satisfies UpdateFieldSet;

export type UpdateMissionDetailsCommandInput = MissionDispatchCommandInput &
	UpdateFieldsInput<typeof MISSION_DETAILS_UPDATE_FIELDS> & {
		readonly missionId: DomainId;
	};

export type UpdateMissionDetailsCommand = MissionDispatchDomainCommand<
	'missionDispatch.updateMissionDetails',
	MissionDispatchCommandPayload & {
		readonly missionId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof MISSION_DETAILS_UPDATE_FIELDS>;
	}
>;

const missionTimestampField: UpdateFieldNormalizer<Date | undefined, Date> = (
	value,
	path,
	issues,
) => normalizeTimestamp(value, path, issues, true);

export const MISSION_SCHEDULE_UPDATE_FIELDS = {
	scheduledStartAt: missionTimestampField,
	scheduledEndAt: timestampField(true),
	rainDate: normalizeOptionalLocalDate,
} satisfies UpdateFieldSet;

export type UpdateMissionScheduleCommandInput = MissionDispatchCommandInput &
	UpdateFieldsInput<typeof MISSION_SCHEDULE_UPDATE_FIELDS> & {
		readonly missionId: DomainId;
		readonly acknowledgedNotificationTimingChange?: boolean;
		readonly acknowledgedWorkedMissionScheduleChange?: boolean;
	};

export type UpdateMissionScheduleCommand = MissionDispatchDomainCommand<
	'missionDispatch.updateMissionSchedule',
	MissionDispatchCommandPayload & {
		readonly missionId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof MISSION_SCHEDULE_UPDATE_FIELDS>;
		readonly acknowledgedNotificationTimingChange: boolean;
		readonly acknowledgedWorkedMissionScheduleChange: boolean;
	}
>;

export const MISSION_PLAN_UPDATE_FIELDS = {
	controlType: stringUnionField(CONTROL_TYPES),
	plannedMethodId: nullableReferenceIdField,
} satisfies UpdateFieldSet;

export type UpdateMissionPlanCommandInput = MissionDispatchCommandInput &
	UpdateFieldsInput<typeof MISSION_PLAN_UPDATE_FIELDS> & {
		readonly missionId: DomainId;
		readonly acknowledgedNotificationPlanChange?: boolean;
		readonly acknowledgedWorkedMissionPlanChange?: boolean;
	};

export type UpdateMissionPlanCommand = MissionDispatchDomainCommand<
	'missionDispatch.updateMissionPlan',
	MissionDispatchCommandPayload & {
		readonly missionId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof MISSION_PLAN_UPDATE_FIELDS>;
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

export interface UpdateMissionNotificationTypeCommandInput extends MissionDispatchCommandInput {
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

export function createMissionCommand(input: CreateMissionCommandInput): CreateMissionCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.missionId, 'missionId', issues);
	const controlType = normalizeStringUnion(input.controlType, CONTROL_TYPES, 'controlType', issues);
	const scheduledStartAt = normalizeTimestamp(
		input.scheduledStartAt,
		'scheduledStartAt',
		issues,
		true,
	);
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
	return updateFieldsCommand({
		type: 'missionDispatch.updateMissionDetails',
		input,
		idKey: 'missionId',
		fields: MISSION_DETAILS_UPDATE_FIELDS,
		changeNoun: 'mission',
		emptyChangeMessage: 'At least one mission detail must change.',
		message: 'Update mission details command is invalid.',
	});
}

export function updateMissionScheduleCommand(
	input: UpdateMissionScheduleCommandInput,
): UpdateMissionScheduleCommand {
	const issues = validateIdCommand(input, 'missionId');
	const changes = normalizeUpdateFields(
		input,
		MISSION_SCHEDULE_UPDATE_FIELDS,
		'At least one mission schedule field must change.',
		issues,
	);
	validateTimestampOrder(
		changes.scheduledStartAt,
		changes.scheduledEndAt,
		'scheduledEndAt',
		issues,
	);
	throwIfIssues('Update mission schedule command is invalid.', issues);
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
	const command = updateFieldsCommand({
		type: 'missionDispatch.updateMissionPlan',
		input,
		idKey: 'missionId',
		fields: MISSION_PLAN_UPDATE_FIELDS,
		changeNoun: 'mission plan',
		message: 'Update mission plan command is invalid.',
	});
	return {
		type: command.type,
		payload: {
			...command.payload,
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
			acknowledgedInProgressAssignmentChange: input.acknowledgedInProgressAssignmentChange ?? false,
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

export function completeMissionCommand(input: CompleteMissionCommandInput): CompleteMissionCommand {
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
			acknowledgedCompletedMissionDeletion: input.acknowledgedCompletedMissionDeletion ?? false,
		},
	};
}
