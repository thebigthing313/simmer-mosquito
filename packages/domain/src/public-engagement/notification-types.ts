import {
	createIssues,
	nullableText as normalizeNullableText,
	requiredId as normalizeRequiredId,
	requiredText as normalizeRequiredText,
	requiredUuid as requireUuid,
	throwIfIssues,
} from '../command-validation.js';
import type { DomainId } from '../shared.js';
import type {
	PublicEngagementCommandInput,
	PublicEngagementCommandPayload,
	PublicEngagementDomainCommand,
} from './core.js';
import { basePayload, validateBase, validateIdCommand } from './core.js';
export interface CreateNotificationTypeCommandInput extends PublicEngagementCommandInput {
	readonly notificationTypeId: DomainId;
	readonly name: string;
	readonly description?: string | null;
}

export type CreateNotificationTypeCommand = PublicEngagementDomainCommand<
	'publicEngagement.createNotificationType',
	PublicEngagementCommandPayload & {
		readonly notificationTypeId: DomainId;
		readonly name: string;
		readonly description: string | null;
	}
>;

export interface UpdateNotificationTypeCommandInput extends PublicEngagementCommandInput {
	readonly notificationTypeId: DomainId;
	readonly name?: string;
	readonly description?: string | null;
	readonly acknowledgedHistoricalLabelChange?: boolean;
}

export type UpdateNotificationTypeCommand = PublicEngagementDomainCommand<
	'publicEngagement.updateNotificationType',
	PublicEngagementCommandPayload & {
		readonly notificationTypeId: DomainId;
		readonly changes: Readonly<{
			readonly name?: string;
			readonly description?: string | null;
		}>;
		readonly acknowledgedHistoricalLabelChange: boolean;
	}
>;

export interface NotificationTypeIdCommandInput extends PublicEngagementCommandInput {
	readonly notificationTypeId: DomainId;
}

export type DeactivateNotificationTypeCommand = PublicEngagementDomainCommand<
	'publicEngagement.deactivateNotificationType',
	PublicEngagementCommandPayload & {
		readonly notificationTypeId: DomainId;
		readonly acknowledgedActiveSubscriptionImpact: boolean;
	}
>;

export interface DeactivateNotificationTypeCommandInput extends NotificationTypeIdCommandInput {
	readonly acknowledgedActiveSubscriptionImpact?: boolean;
}

export type ReactivateNotificationTypeCommand = PublicEngagementDomainCommand<
	'publicEngagement.reactivateNotificationType',
	PublicEngagementCommandPayload & { readonly notificationTypeId: DomainId }
>;

export type DeleteNotificationTypeCommand = PublicEngagementDomainCommand<
	'publicEngagement.deleteNotificationType',
	PublicEngagementCommandPayload & { readonly notificationTypeId: DomainId }
>;

export function createNotificationTypeCommand(
	input: CreateNotificationTypeCommandInput,
): CreateNotificationTypeCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.notificationTypeId, 'notificationTypeId', issues);
	const name = normalizeRequiredText(input.name, 'name', issues, 200);
	const description = normalizeNullableText(input.description, 'description', issues, 2_000);
	throwIfIssues('Create notification type command is invalid.', issues);
	return {
		type: 'publicEngagement.createNotificationType',
		payload: {
			...basePayload(input),
			notificationTypeId: normalizeRequiredId(input.notificationTypeId),
			name,
			description,
		},
	};
}

export function updateNotificationTypeCommand(
	input: UpdateNotificationTypeCommandInput,
): UpdateNotificationTypeCommand {
	const issues = validateIdCommand(input, 'notificationTypeId');
	const hasName = input.name !== undefined;
	const hasDescription = input.description !== undefined;
	if (!hasName && !hasDescription) {
		issues.push({ path: 'changes', message: 'At least one notification type field must change.' });
	}
	const name = hasName ? normalizeRequiredText(input.name, 'name', issues, 200) : undefined;
	const description = hasDescription
		? normalizeNullableText(input.description, 'description', issues, 2_000)
		: undefined;
	throwIfIssues('Update notification type command is invalid.', issues);
	return {
		type: 'publicEngagement.updateNotificationType',
		payload: {
			...basePayload(input),
			notificationTypeId: normalizeRequiredId(input.notificationTypeId),
			changes: {
				...(name !== undefined ? { name } : {}),
				...(hasDescription ? { description: description ?? null } : {}),
			},
			acknowledgedHistoricalLabelChange: input.acknowledgedHistoricalLabelChange ?? false,
		},
	};
}

export function deactivateNotificationTypeCommand(
	input: DeactivateNotificationTypeCommandInput,
): DeactivateNotificationTypeCommand {
	const issues = validateIdCommand(input, 'notificationTypeId');
	throwIfIssues('Deactivate notification type command is invalid.', issues);
	return {
		type: 'publicEngagement.deactivateNotificationType',
		payload: {
			...basePayload(input),
			notificationTypeId: normalizeRequiredId(input.notificationTypeId),
			acknowledgedActiveSubscriptionImpact: input.acknowledgedActiveSubscriptionImpact ?? false,
		},
	};
}

export function reactivateNotificationTypeCommand(
	input: NotificationTypeIdCommandInput,
): ReactivateNotificationTypeCommand {
	return notificationTypeIdCommand(
		'publicEngagement.reactivateNotificationType',
		input,
		'Reactivate notification type command is invalid.',
	);
}

export function deleteNotificationTypeCommand(
	input: NotificationTypeIdCommandInput,
): DeleteNotificationTypeCommand {
	return notificationTypeIdCommand(
		'publicEngagement.deleteNotificationType',
		input,
		'Delete notification type command is invalid.',
	);
}

function notificationTypeIdCommand<
	TType extends
		| 'publicEngagement.reactivateNotificationType'
		| 'publicEngagement.deleteNotificationType',
>(
	type: TType,
	input: NotificationTypeIdCommandInput,
	message: string,
): PublicEngagementDomainCommand<
	TType,
	PublicEngagementCommandPayload & { readonly notificationTypeId: DomainId }
> {
	const issues = validateIdCommand(input, 'notificationTypeId');
	throwIfIssues(message, issues);
	return {
		type,
		payload: {
			...basePayload(input),
			notificationTypeId: normalizeRequiredId(input.notificationTypeId),
		},
	};
}
