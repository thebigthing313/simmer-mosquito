import {
	basePayload,
	createIssues,
	nullableText as normalizeNullableText,
	requiredId as normalizeRequiredId,
	requiredText as normalizeRequiredText,
	requiredUuid as requireUuid,
	throwIfIssues,
	validateBase,
	validateIdCommand,
} from '../command-validation.js';
import type { DomainId } from '../shared.js';
import {
	nullableTextField,
	requiredTextField,
	type UpdateFieldSet,
	type UpdateFieldsChanges,
	type UpdateFieldsInput,
	updateFieldsCommand,
} from '../update-command-fields.js';
import type {
	PublicEngagementCommandInput,
	PublicEngagementCommandPayload,
	PublicEngagementDomainCommand,
} from './core.js';
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

export const NOTIFICATION_TYPE_UPDATE_FIELDS = {
	name: requiredTextField(200),
	description: nullableTextField(2_000),
} satisfies UpdateFieldSet;

export type UpdateNotificationTypeCommandInput = PublicEngagementCommandInput &
	UpdateFieldsInput<typeof NOTIFICATION_TYPE_UPDATE_FIELDS> & {
		readonly notificationTypeId: DomainId;
		readonly acknowledgedHistoricalLabelChange?: boolean;
	};

export type UpdateNotificationTypeCommand = PublicEngagementDomainCommand<
	'publicEngagement.updateNotificationType',
	PublicEngagementCommandPayload & {
		readonly notificationTypeId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof NOTIFICATION_TYPE_UPDATE_FIELDS>;
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
	const command = updateFieldsCommand({
		type: 'publicEngagement.updateNotificationType',
		input,
		idKey: 'notificationTypeId',
		fields: NOTIFICATION_TYPE_UPDATE_FIELDS,
		changeNoun: 'notification type',
		message: 'Update notification type command is invalid.',
	});
	return {
		type: command.type,
		payload: {
			...command.payload,
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
