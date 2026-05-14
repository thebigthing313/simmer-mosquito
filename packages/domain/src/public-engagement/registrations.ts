import {
	createIssues,
	requiredId as normalizeRequiredId,
	requiredUuid as requireUuid,
	throwIfIssues,
} from '../command-validation.js';
import type { DomainId } from '../shared.js';
import type {
	ContactReference,
	ContactReferenceInput,
	NotificationRegistrationLocation,
	NotificationRegistrationLocationInput,
	NotificationRegistrationSubscription,
	NotificationRegistrationSubscriptionInput,
	PublicEngagementCommandInput,
	PublicEngagementCommandPayload,
	PublicEngagementDomainCommand,
} from './core.js';
import {
	basePayload,
	normalizeBooleanDefault,
	normalizeBuffer,
	validateBase,
	validateBoolean,
	validateContactReference,
	validateIdCommand,
	validateNotificationRegistrationLocation,
	validateRegistrationPurpose,
	validateSubscriptionList,
} from './core.js';
export interface CreateNotificationRegistrationCommandInput extends PublicEngagementCommandInput {
	readonly notificationRegistrationId: DomainId;
	readonly contact: ContactReferenceInput;
	readonly location: NotificationRegistrationLocationInput;
	readonly bufferDistance?: number | null;
	readonly bufferUnitId?: DomainId | null;
	readonly hasBees?: boolean;
	readonly isNoSpray?: boolean;
	readonly subscriptions?: readonly NotificationRegistrationSubscriptionInput[];
}

export type CreateNotificationRegistrationCommand = PublicEngagementDomainCommand<
	'publicEngagement.createNotificationRegistration',
	PublicEngagementCommandPayload & {
		readonly notificationRegistrationId: DomainId;
		readonly contact: ContactReference;
		readonly location: NotificationRegistrationLocation;
		readonly bufferDistance: number | null;
		readonly bufferUnitId: DomainId | null;
		readonly hasBees: boolean;
		readonly isNoSpray: boolean;
		readonly subscriptions: readonly NotificationRegistrationSubscription[];
	}
>;

export interface UpdateNotificationRegistrationContactCommandInput
	extends PublicEngagementCommandInput {
	readonly notificationRegistrationId: DomainId;
	readonly contact: ContactReferenceInput;
	readonly acknowledgedHistoricalContactChange?: boolean;
}

export type UpdateNotificationRegistrationContactCommand = PublicEngagementDomainCommand<
	'publicEngagement.updateNotificationRegistrationContact',
	PublicEngagementCommandPayload & {
		readonly notificationRegistrationId: DomainId;
		readonly contact: ContactReference;
		readonly acknowledgedHistoricalContactChange: boolean;
	}
>;

export interface UpdateNotificationRegistrationLocationCommandInput
	extends PublicEngagementCommandInput {
	readonly notificationRegistrationId: DomainId;
	readonly location: NotificationRegistrationLocationInput;
	readonly acknowledgedFutureOnlyChange?: boolean;
}

export type UpdateNotificationRegistrationLocationCommand = PublicEngagementDomainCommand<
	'publicEngagement.updateNotificationRegistrationLocation',
	PublicEngagementCommandPayload & {
		readonly notificationRegistrationId: DomainId;
		readonly location: NotificationRegistrationLocation;
		readonly acknowledgedFutureOnlyChange: boolean;
	}
>;

export interface UpdateNotificationRegistrationBufferCommandInput
	extends PublicEngagementCommandInput {
	readonly notificationRegistrationId: DomainId;
	readonly bufferDistance: number | null;
	readonly bufferUnitId: DomainId | null;
	readonly acknowledgedFutureOnlyChange?: boolean;
}

export type UpdateNotificationRegistrationBufferCommand = PublicEngagementDomainCommand<
	'publicEngagement.updateNotificationRegistrationBuffer',
	PublicEngagementCommandPayload & {
		readonly notificationRegistrationId: DomainId;
		readonly bufferDistance: number | null;
		readonly bufferUnitId: DomainId | null;
		readonly acknowledgedFutureOnlyChange: boolean;
	}
>;

export interface UpdateNotificationRegistrationFlagsCommandInput
	extends PublicEngagementCommandInput {
	readonly notificationRegistrationId: DomainId;
	readonly hasBees?: boolean;
	readonly isNoSpray?: boolean;
	readonly acknowledgedFutureOnlyChange?: boolean;
}

export type UpdateNotificationRegistrationFlagsCommand = PublicEngagementDomainCommand<
	'publicEngagement.updateNotificationRegistrationFlags',
	PublicEngagementCommandPayload & {
		readonly notificationRegistrationId: DomainId;
		readonly changes: Readonly<{
			readonly hasBees?: boolean;
			readonly isNoSpray?: boolean;
		}>;
		readonly acknowledgedFutureOnlyChange: boolean;
	}
>;

export interface NotificationRegistrationIdCommandInput extends PublicEngagementCommandInput {
	readonly notificationRegistrationId: DomainId;
}

export type DeactivateNotificationRegistrationCommand = PublicEngagementDomainCommand<
	'publicEngagement.deactivateNotificationRegistration',
	PublicEngagementCommandPayload & { readonly notificationRegistrationId: DomainId }
>;

export type ReactivateNotificationRegistrationCommand = PublicEngagementDomainCommand<
	'publicEngagement.reactivateNotificationRegistration',
	PublicEngagementCommandPayload & { readonly notificationRegistrationId: DomainId }
>;

export type DeleteNotificationRegistrationCommand = PublicEngagementDomainCommand<
	'publicEngagement.deleteNotificationRegistration',
	PublicEngagementCommandPayload & { readonly notificationRegistrationId: DomainId }
>;

export interface SubscribeNotificationRegistrationTypeCommandInput
	extends PublicEngagementCommandInput {
	readonly notificationRegistrationTypeId: DomainId;
	readonly notificationRegistrationId: DomainId;
	readonly notificationTypeId: DomainId;
}

export type SubscribeNotificationRegistrationTypeCommand = PublicEngagementDomainCommand<
	'publicEngagement.subscribeNotificationRegistrationType',
	PublicEngagementCommandPayload &
		NotificationRegistrationSubscription & {
			readonly notificationRegistrationId: DomainId;
		}
>;

export interface UnsubscribeNotificationRegistrationTypeCommandInput
	extends PublicEngagementCommandInput {
	readonly notificationRegistrationTypeId: DomainId;
	readonly acknowledgedFutureOnlyChange?: boolean;
}

export type UnsubscribeNotificationRegistrationTypeCommand = PublicEngagementDomainCommand<
	'publicEngagement.unsubscribeNotificationRegistrationType',
	PublicEngagementCommandPayload & {
		readonly notificationRegistrationTypeId: DomainId;
		readonly acknowledgedFutureOnlyChange: boolean;
	}
>;

export function createNotificationRegistrationCommand(
	input: CreateNotificationRegistrationCommandInput,
): CreateNotificationRegistrationCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.notificationRegistrationId, 'notificationRegistrationId', issues);
	const contact = validateContactReference(input.contact, 'contact', issues);
	const location = validateNotificationRegistrationLocation(input.location, 'location', issues);
	const { bufferDistance, bufferUnitId } = normalizeBuffer(input, issues);
	const hasBees = normalizeBooleanDefault(input.hasBees, 'hasBees', issues, false);
	const isNoSpray = normalizeBooleanDefault(input.isNoSpray, 'isNoSpray', issues, false);
	const subscriptions = validateSubscriptionList(
		input.subscriptions ?? [],
		'subscriptions',
		issues,
	);
	validateRegistrationPurpose(subscriptions.length > 0, hasBees, isNoSpray, 'purpose', issues);
	throwIfIssues('Create notification registration command is invalid.', issues);
	return {
		type: 'publicEngagement.createNotificationRegistration',
		payload: {
			...basePayload(input),
			notificationRegistrationId: normalizeRequiredId(input.notificationRegistrationId),
			contact,
			location,
			bufferDistance,
			bufferUnitId,
			hasBees,
			isNoSpray,
			subscriptions,
		},
	};
}

export function updateNotificationRegistrationContactCommand(
	input: UpdateNotificationRegistrationContactCommandInput,
): UpdateNotificationRegistrationContactCommand {
	const issues = validateIdCommand(input, 'notificationRegistrationId');
	const contact = validateContactReference(input.contact, 'contact', issues);
	throwIfIssues('Update notification registration contact command is invalid.', issues);
	return {
		type: 'publicEngagement.updateNotificationRegistrationContact',
		payload: {
			...basePayload(input),
			notificationRegistrationId: normalizeRequiredId(input.notificationRegistrationId),
			contact,
			acknowledgedHistoricalContactChange: input.acknowledgedHistoricalContactChange ?? false,
		},
	};
}

export function updateNotificationRegistrationLocationCommand(
	input: UpdateNotificationRegistrationLocationCommandInput,
): UpdateNotificationRegistrationLocationCommand {
	const issues = validateIdCommand(input, 'notificationRegistrationId');
	const location = validateNotificationRegistrationLocation(input.location, 'location', issues);
	throwIfIssues('Update notification registration location command is invalid.', issues);
	return {
		type: 'publicEngagement.updateNotificationRegistrationLocation',
		payload: {
			...basePayload(input),
			notificationRegistrationId: normalizeRequiredId(input.notificationRegistrationId),
			location,
			acknowledgedFutureOnlyChange: input.acknowledgedFutureOnlyChange ?? false,
		},
	};
}

export function updateNotificationRegistrationBufferCommand(
	input: UpdateNotificationRegistrationBufferCommandInput,
): UpdateNotificationRegistrationBufferCommand {
	const issues = validateIdCommand(input, 'notificationRegistrationId');
	const { bufferDistance, bufferUnitId } = normalizeBuffer(input, issues);
	throwIfIssues('Update notification registration buffer command is invalid.', issues);
	return {
		type: 'publicEngagement.updateNotificationRegistrationBuffer',
		payload: {
			...basePayload(input),
			notificationRegistrationId: normalizeRequiredId(input.notificationRegistrationId),
			bufferDistance,
			bufferUnitId,
			acknowledgedFutureOnlyChange: input.acknowledgedFutureOnlyChange ?? false,
		},
	};
}

export function updateNotificationRegistrationFlagsCommand(
	input: UpdateNotificationRegistrationFlagsCommandInput,
): UpdateNotificationRegistrationFlagsCommand {
	const issues = validateIdCommand(input, 'notificationRegistrationId');
	const hasHasBees = input.hasBees !== undefined;
	const hasIsNoSpray = input.isNoSpray !== undefined;
	if (!hasHasBees && !hasIsNoSpray) {
		issues.push({
			path: 'changes',
			message: 'At least one notification registration flag must change.',
		});
	}
	if (hasHasBees) {
		validateBoolean(input.hasBees, 'hasBees', issues);
	}
	if (hasIsNoSpray) {
		validateBoolean(input.isNoSpray, 'isNoSpray', issues);
	}
	throwIfIssues('Update notification registration flags command is invalid.', issues);
	return {
		type: 'publicEngagement.updateNotificationRegistrationFlags',
		payload: {
			...basePayload(input),
			notificationRegistrationId: normalizeRequiredId(input.notificationRegistrationId),
			changes: {
				...(hasHasBees ? { hasBees: input.hasBees === true } : {}),
				...(hasIsNoSpray ? { isNoSpray: input.isNoSpray === true } : {}),
			},
			acknowledgedFutureOnlyChange: input.acknowledgedFutureOnlyChange ?? false,
		},
	};
}

export function deactivateNotificationRegistrationCommand(
	input: NotificationRegistrationIdCommandInput,
): DeactivateNotificationRegistrationCommand {
	return notificationRegistrationIdCommand(
		'publicEngagement.deactivateNotificationRegistration',
		input,
		'Deactivate notification registration command is invalid.',
	);
}

export function reactivateNotificationRegistrationCommand(
	input: NotificationRegistrationIdCommandInput,
): ReactivateNotificationRegistrationCommand {
	return notificationRegistrationIdCommand(
		'publicEngagement.reactivateNotificationRegistration',
		input,
		'Reactivate notification registration command is invalid.',
	);
}

export function deleteNotificationRegistrationCommand(
	input: NotificationRegistrationIdCommandInput,
): DeleteNotificationRegistrationCommand {
	return notificationRegistrationIdCommand(
		'publicEngagement.deleteNotificationRegistration',
		input,
		'Delete notification registration command is invalid.',
	);
}

export function subscribeNotificationRegistrationTypeCommand(
	input: SubscribeNotificationRegistrationTypeCommandInput,
): SubscribeNotificationRegistrationTypeCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.notificationRegistrationTypeId, 'notificationRegistrationTypeId', issues);
	requireUuid(input.notificationRegistrationId, 'notificationRegistrationId', issues);
	requireUuid(input.notificationTypeId, 'notificationTypeId', issues);
	throwIfIssues('Subscribe notification registration type command is invalid.', issues);
	return {
		type: 'publicEngagement.subscribeNotificationRegistrationType',
		payload: {
			...basePayload(input),
			notificationRegistrationTypeId: normalizeRequiredId(input.notificationRegistrationTypeId),
			notificationRegistrationId: normalizeRequiredId(input.notificationRegistrationId),
			notificationTypeId: normalizeRequiredId(input.notificationTypeId),
		},
	};
}

export function unsubscribeNotificationRegistrationTypeCommand(
	input: UnsubscribeNotificationRegistrationTypeCommandInput,
): UnsubscribeNotificationRegistrationTypeCommand {
	const issues = validateIdCommand(input, 'notificationRegistrationTypeId');
	throwIfIssues('Unsubscribe notification registration type command is invalid.', issues);
	return {
		type: 'publicEngagement.unsubscribeNotificationRegistrationType',
		payload: {
			...basePayload(input),
			notificationRegistrationTypeId: normalizeRequiredId(input.notificationRegistrationTypeId),
			acknowledgedFutureOnlyChange: input.acknowledgedFutureOnlyChange ?? false,
		},
	};
}

function notificationRegistrationIdCommand<
	TType extends
		| 'publicEngagement.deactivateNotificationRegistration'
		| 'publicEngagement.reactivateNotificationRegistration'
		| 'publicEngagement.deleteNotificationRegistration',
>(
	type: TType,
	input: NotificationRegistrationIdCommandInput,
	message: string,
): PublicEngagementDomainCommand<
	TType,
	PublicEngagementCommandPayload & { readonly notificationRegistrationId: DomainId }
> {
	const issues = validateIdCommand(input, 'notificationRegistrationId');
	throwIfIssues(message, issues);
	return {
		type,
		payload: {
			...basePayload(input),
			notificationRegistrationId: normalizeRequiredId(input.notificationRegistrationId),
		},
	};
}
