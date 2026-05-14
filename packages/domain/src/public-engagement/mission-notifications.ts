import { requiredId as normalizeRequiredId, throwIfIssues } from '../command-validation.js';
import type { DomainId } from '../shared.js';
import type {
	PublicEngagementCommandInput,
	PublicEngagementCommandPayload,
	PublicEngagementDomainCommand,
} from './core.js';
import { basePayload, normalizeOptionalTimestamp, validateIdCommand } from './core.js';
export interface GenerateMissionNotificationsCommandInput extends PublicEngagementCommandInput {
	readonly missionId: DomainId;
}

export type GenerateMissionNotificationsCommand = PublicEngagementDomainCommand<
	'publicEngagement.generateMissionNotifications',
	PublicEngagementCommandPayload & { readonly missionId: DomainId }
>;

export interface MissionNotificationStatusCommandInput extends PublicEngagementCommandInput {
	readonly missionNotificationId: DomainId;
	readonly statusChangedAt?: Date | null;
}

export type CompleteMissionNotificationCommand = PublicEngagementDomainCommand<
	'publicEngagement.completeMissionNotification',
	PublicEngagementCommandPayload & {
		readonly missionNotificationId: DomainId;
		readonly statusChangedAt: Date | null;
	}
>;

export type FailMissionNotificationCommand = PublicEngagementDomainCommand<
	'publicEngagement.failMissionNotification',
	CompleteMissionNotificationCommand['payload']
>;

export type SkipMissionNotificationCommand = PublicEngagementDomainCommand<
	'publicEngagement.skipMissionNotification',
	CompleteMissionNotificationCommand['payload']
>;

export type ReopenMissionNotificationCommand = PublicEngagementDomainCommand<
	'publicEngagement.reopenMissionNotification',
	CompleteMissionNotificationCommand['payload']
>;

export function generateMissionNotificationsCommand(
	input: GenerateMissionNotificationsCommandInput,
): GenerateMissionNotificationsCommand {
	const issues = validateIdCommand(input, 'missionId');
	throwIfIssues('Generate mission notifications command is invalid.', issues);
	return {
		type: 'publicEngagement.generateMissionNotifications',
		payload: { ...basePayload(input), missionId: normalizeRequiredId(input.missionId) },
	};
}

export function completeMissionNotificationCommand(
	input: MissionNotificationStatusCommandInput,
): CompleteMissionNotificationCommand {
	return missionNotificationStatusCommand(
		'publicEngagement.completeMissionNotification',
		input,
		'Complete mission notification command is invalid.',
	);
}

export function failMissionNotificationCommand(
	input: MissionNotificationStatusCommandInput,
): FailMissionNotificationCommand {
	return missionNotificationStatusCommand(
		'publicEngagement.failMissionNotification',
		input,
		'Fail mission notification command is invalid.',
	);
}

export function skipMissionNotificationCommand(
	input: MissionNotificationStatusCommandInput,
): SkipMissionNotificationCommand {
	return missionNotificationStatusCommand(
		'publicEngagement.skipMissionNotification',
		input,
		'Skip mission notification command is invalid.',
	);
}

export function reopenMissionNotificationCommand(
	input: MissionNotificationStatusCommandInput,
): ReopenMissionNotificationCommand {
	return missionNotificationStatusCommand(
		'publicEngagement.reopenMissionNotification',
		input,
		'Reopen mission notification command is invalid.',
	);
}

function missionNotificationStatusCommand<
	TType extends
		| 'publicEngagement.completeMissionNotification'
		| 'publicEngagement.failMissionNotification'
		| 'publicEngagement.skipMissionNotification'
		| 'publicEngagement.reopenMissionNotification',
>(
	type: TType,
	input: MissionNotificationStatusCommandInput,
	message: string,
): PublicEngagementDomainCommand<TType, CompleteMissionNotificationCommand['payload']> {
	const issues = validateIdCommand(input, 'missionNotificationId');
	const statusChangedAt = normalizeOptionalTimestamp(
		input.statusChangedAt,
		'statusChangedAt',
		issues,
	);
	throwIfIssues(message, issues);
	return {
		type,
		payload: {
			...basePayload(input),
			missionNotificationId: normalizeRequiredId(input.missionNotificationId),
			statusChangedAt,
		},
	};
}
