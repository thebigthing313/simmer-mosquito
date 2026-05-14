import {
	type DomainId,
	DomainValidationError,
	type DomainValidationIssue,
	type GeoJsonPoint,
	type JsonObject,
	type LocalDateString,
	normalizeGeometry,
	normalizePointGeometry,
	type SupportedGeoJsonGeometry,
} from './shared.js';

export type RequestIntakeType = 'online' | 'phone' | 'walk-in' | 'other';
export type NotificationChannel = 'email' | 'sms' | 'phone';
export type MissionNotificationStatus = 'pending' | 'completed' | 'failed' | 'skipped';
export type NotificationRegistrationGeometry = SupportedGeoJsonGeometry;

export type PublicEngagementCommandType =
	| 'publicEngagement.createContact'
	| 'publicEngagement.updateContactDetails'
	| 'publicEngagement.updateContactCommunication'
	| 'publicEngagement.mergeContacts'
	| 'publicEngagement.deleteContact'
	| 'publicEngagement.createServiceRequest'
	| 'publicEngagement.updateServiceRequestDetails'
	| 'publicEngagement.updateServiceRequestContact'
	| 'publicEngagement.updateServiceRequestLocation'
	| 'publicEngagement.closeServiceRequest'
	| 'publicEngagement.reopenServiceRequest'
	| 'publicEngagement.deleteServiceRequest'
	| 'publicEngagement.createNotificationType'
	| 'publicEngagement.updateNotificationType'
	| 'publicEngagement.deactivateNotificationType'
	| 'publicEngagement.reactivateNotificationType'
	| 'publicEngagement.deleteNotificationType'
	| 'publicEngagement.createNotificationRegistration'
	| 'publicEngagement.updateNotificationRegistrationContact'
	| 'publicEngagement.updateNotificationRegistrationLocation'
	| 'publicEngagement.updateNotificationRegistrationBuffer'
	| 'publicEngagement.updateNotificationRegistrationFlags'
	| 'publicEngagement.deactivateNotificationRegistration'
	| 'publicEngagement.reactivateNotificationRegistration'
	| 'publicEngagement.deleteNotificationRegistration'
	| 'publicEngagement.subscribeNotificationRegistrationType'
	| 'publicEngagement.unsubscribeNotificationRegistrationType'
	| 'publicEngagement.generateMissionNotifications'
	| 'publicEngagement.completeMissionNotification'
	| 'publicEngagement.failMissionNotification'
	| 'publicEngagement.skipMissionNotification'
	| 'publicEngagement.reopenMissionNotification';

export interface PublicEngagementDomainCommand<
	TType extends PublicEngagementCommandType,
	TPayload,
> {
	readonly type: TType;
	readonly payload: TPayload;
}

interface PublicEngagementCommandInput {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

interface PublicEngagementCommandPayload {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export interface CreateContactDetailsInput {
	readonly contactName?: string | null;
	readonly preferredPhone?: string | null;
	readonly alternatePhone?: string | null;
	readonly email?: string | null;
	readonly company?: string | null;
	readonly department?: string | null;
	readonly title?: string | null;
	readonly wantsEmail?: boolean;
	readonly wantsSms?: boolean;
	readonly wantsPhone?: boolean;
}

export interface CreateContactDetails {
	readonly contactName: string | null;
	readonly preferredPhone: string | null;
	readonly alternatePhone: string | null;
	readonly email: string | null;
	readonly company: string | null;
	readonly department: string | null;
	readonly title: string | null;
	readonly wantsEmail: boolean;
	readonly wantsSms: boolean;
	readonly wantsPhone: boolean;
}

export interface CreateInlineAddressDetailsInput {
	readonly displayName: string;
	readonly geometry: unknown;
	readonly country?: string | null;
	readonly addressLine1?: string | null;
	readonly addressLine2?: string | null;
	readonly locality?: string | null;
	readonly region?: string | null;
	readonly postalCode?: string | null;
	readonly geocoderResponse?: unknown | null;
}

export interface CreateInlineAddressDetails {
	readonly displayName: string;
	readonly geometry: GeoJsonPoint;
	readonly country: 'US';
	readonly addressLine1: string | null;
	readonly addressLine2: string | null;
	readonly locality: string | null;
	readonly region: string | null;
	readonly postalCode: string | null;
	readonly geocoderResponse: JsonObject | null;
}

export type ContactReferenceInput =
	| { readonly kind: 'existing'; readonly contactId: DomainId }
	| {
			readonly kind: 'new';
			readonly contactId: DomainId;
			readonly details: CreateContactDetailsInput;
	  };

export type ContactReference =
	| { readonly kind: 'existing'; readonly contactId: DomainId }
	| { readonly kind: 'new'; readonly contactId: DomainId; readonly details: CreateContactDetails };

export type ServiceRequestAddressInput =
	| { readonly kind: 'existing'; readonly addressId: DomainId }
	| {
			readonly kind: 'new';
			readonly addressId: DomainId;
			readonly details: CreateInlineAddressDetailsInput;
	  };

export type ServiceRequestAddress =
	| { readonly kind: 'existing'; readonly addressId: DomainId }
	| {
			readonly kind: 'new';
			readonly addressId: DomainId;
			readonly details: CreateInlineAddressDetails;
	  };

export type NotificationRegistrationAddressInput =
	| { readonly kind: 'none' }
	| { readonly kind: 'existing'; readonly addressId: DomainId }
	| {
			readonly kind: 'new';
			readonly addressId: DomainId;
			readonly details: CreateInlineAddressDetailsInput;
	  };

export type NotificationRegistrationAddress =
	| { readonly kind: 'none' }
	| { readonly kind: 'existing'; readonly addressId: DomainId }
	| {
			readonly kind: 'new';
			readonly addressId: DomainId;
			readonly details: CreateInlineAddressDetails;
	  };

export interface ServiceRequestLocationInput {
	readonly address: ServiceRequestAddressInput;
	readonly geometry: unknown;
}

export interface ServiceRequestLocation {
	readonly address: ServiceRequestAddress;
	readonly geometry: GeoJsonPoint;
}

export interface NotificationRegistrationLocationInput {
	readonly address?: NotificationRegistrationAddressInput;
	readonly geometry: unknown;
}

export interface NotificationRegistrationLocation {
	readonly address: NotificationRegistrationAddress;
	readonly geometry: NotificationRegistrationGeometry;
}

export interface NotificationRegistrationSubscriptionInput {
	readonly notificationRegistrationTypeId: DomainId;
	readonly notificationTypeId: DomainId;
}

export interface NotificationRegistrationSubscription {
	readonly notificationRegistrationTypeId: DomainId;
	readonly notificationTypeId: DomainId;
}

export interface CreateContactCommandInput
	extends PublicEngagementCommandInput,
		CreateContactDetailsInput {
	readonly contactId: DomainId;
}

export type CreateContactCommand = PublicEngagementDomainCommand<
	'publicEngagement.createContact',
	PublicEngagementCommandPayload & { readonly contactId: DomainId } & CreateContactDetails
>;

export interface UpdateContactDetailsCommandInput extends PublicEngagementCommandInput {
	readonly contactId: DomainId;
	readonly contactName?: string | null;
	readonly company?: string | null;
	readonly department?: string | null;
	readonly title?: string | null;
}

export type UpdateContactDetailsCommand = PublicEngagementDomainCommand<
	'publicEngagement.updateContactDetails',
	PublicEngagementCommandPayload & {
		readonly contactId: DomainId;
		readonly changes: Readonly<{
			readonly contactName?: string | null;
			readonly company?: string | null;
			readonly department?: string | null;
			readonly title?: string | null;
		}>;
	}
>;

export interface UpdateContactCommunicationCommandInput extends PublicEngagementCommandInput {
	readonly contactId: DomainId;
	readonly preferredPhone?: string | null;
	readonly alternatePhone?: string | null;
	readonly email?: string | null;
	readonly wantsEmail?: boolean;
	readonly wantsSms?: boolean;
	readonly wantsPhone?: boolean;
}

export type UpdateContactCommunicationCommand = PublicEngagementDomainCommand<
	'publicEngagement.updateContactCommunication',
	PublicEngagementCommandPayload & {
		readonly contactId: DomainId;
		readonly changes: Readonly<{
			readonly preferredPhone?: string | null;
			readonly alternatePhone?: string | null;
			readonly email?: string | null;
			readonly wantsEmail?: boolean;
			readonly wantsSms?: boolean;
			readonly wantsPhone?: boolean;
		}>;
	}
>;

export interface MergeContactsCommandInput extends PublicEngagementCommandInput {
	readonly targetContactId: DomainId;
	readonly sourceContactIds: readonly DomainId[];
	readonly acknowledgedContactMerge?: boolean;
}

export type MergeContactsCommand = PublicEngagementDomainCommand<
	'publicEngagement.mergeContacts',
	PublicEngagementCommandPayload & {
		readonly targetContactId: DomainId;
		readonly sourceContactIds: readonly DomainId[];
		readonly acknowledgedContactMerge: true;
	}
>;

export interface ContactIdCommandInput extends PublicEngagementCommandInput {
	readonly contactId: DomainId;
}

export type DeleteContactCommand = PublicEngagementDomainCommand<
	'publicEngagement.deleteContact',
	PublicEngagementCommandPayload & { readonly contactId: DomainId }
>;

export interface CreateServiceRequestCommandInput extends PublicEngagementCommandInput {
	readonly serviceRequestId: DomainId;
	readonly contact: ContactReferenceInput;
	readonly location: ServiceRequestLocationInput;
	readonly intakeType: RequestIntakeType;
	readonly requestDate: LocalDateString;
	readonly details: string;
	readonly receivedByProfileId?: DomainId | null;
}

export type CreateServiceRequestCommand = PublicEngagementDomainCommand<
	'publicEngagement.createServiceRequest',
	PublicEngagementCommandPayload & {
		readonly serviceRequestId: DomainId;
		readonly contact: ContactReference;
		readonly location: ServiceRequestLocation;
		readonly intakeType: RequestIntakeType;
		readonly requestDate: LocalDateString;
		readonly details: string;
		readonly receivedByProfileId: DomainId | null;
	}
>;

export interface UpdateServiceRequestDetailsCommandInput extends PublicEngagementCommandInput {
	readonly serviceRequestId: DomainId;
	readonly requestDate?: LocalDateString;
	readonly intakeType?: RequestIntakeType;
	readonly receivedByProfileId?: DomainId | null;
	readonly details?: string;
	readonly acknowledgedClosedRequestChange?: boolean;
}

export type UpdateServiceRequestDetailsCommand = PublicEngagementDomainCommand<
	'publicEngagement.updateServiceRequestDetails',
	PublicEngagementCommandPayload & {
		readonly serviceRequestId: DomainId;
		readonly changes: Readonly<{
			readonly requestDate?: LocalDateString;
			readonly intakeType?: RequestIntakeType;
			readonly receivedByProfileId?: DomainId | null;
			readonly details?: string;
		}>;
		readonly acknowledgedClosedRequestChange: boolean;
	}
>;

export interface UpdateServiceRequestContactCommandInput extends PublicEngagementCommandInput {
	readonly serviceRequestId: DomainId;
	readonly contact: ContactReferenceInput;
	readonly acknowledgedHistoricalContactChange?: boolean;
}

export type UpdateServiceRequestContactCommand = PublicEngagementDomainCommand<
	'publicEngagement.updateServiceRequestContact',
	PublicEngagementCommandPayload & {
		readonly serviceRequestId: DomainId;
		readonly contact: ContactReference;
		readonly acknowledgedHistoricalContactChange: boolean;
	}
>;

export interface UpdateServiceRequestLocationCommandInput extends PublicEngagementCommandInput {
	readonly serviceRequestId: DomainId;
	readonly location: ServiceRequestLocationInput;
	readonly acknowledgedHistoricalLocationChange?: boolean;
}

export type UpdateServiceRequestLocationCommand = PublicEngagementDomainCommand<
	'publicEngagement.updateServiceRequestLocation',
	PublicEngagementCommandPayload & {
		readonly serviceRequestId: DomainId;
		readonly location: ServiceRequestLocation;
		readonly acknowledgedHistoricalLocationChange: boolean;
	}
>;

export interface CloseServiceRequestCommandInput extends PublicEngagementCommandInput {
	readonly serviceRequestId: DomainId;
	readonly resolutionCommentId: DomainId;
	readonly resolutionSummary: string;
	readonly closedAt?: Date | null;
}

export type CloseServiceRequestCommand = PublicEngagementDomainCommand<
	'publicEngagement.closeServiceRequest',
	PublicEngagementCommandPayload & {
		readonly serviceRequestId: DomainId;
		readonly resolutionCommentId: DomainId;
		readonly resolutionSummary: string;
		readonly closedAt: Date | null;
	}
>;

export interface ReopenServiceRequestCommandInput extends PublicEngagementCommandInput {
	readonly serviceRequestId: DomainId;
	readonly reopenCommentId: DomainId;
	readonly reopenReason: string;
	readonly reopenedAt?: Date | null;
}

export type ReopenServiceRequestCommand = PublicEngagementDomainCommand<
	'publicEngagement.reopenServiceRequest',
	PublicEngagementCommandPayload & {
		readonly serviceRequestId: DomainId;
		readonly reopenCommentId: DomainId;
		readonly reopenReason: string;
		readonly reopenedAt: Date | null;
	}
>;

export interface DeleteServiceRequestCommandInput extends PublicEngagementCommandInput {
	readonly serviceRequestId: DomainId;
	readonly acknowledgedClosedRequestDeletion?: boolean;
	readonly acknowledgedAssignmentItemDeletion?: boolean;
}

export type DeleteServiceRequestCommand = PublicEngagementDomainCommand<
	'publicEngagement.deleteServiceRequest',
	PublicEngagementCommandPayload & {
		readonly serviceRequestId: DomainId;
		readonly acknowledgedClosedRequestDeletion: boolean;
		readonly acknowledgedAssignmentItemDeletion: boolean;
	}
>;

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

export type PublicEngagementCommand =
	| CreateContactCommand
	| UpdateContactDetailsCommand
	| UpdateContactCommunicationCommand
	| MergeContactsCommand
	| DeleteContactCommand
	| CreateServiceRequestCommand
	| UpdateServiceRequestDetailsCommand
	| UpdateServiceRequestContactCommand
	| UpdateServiceRequestLocationCommand
	| CloseServiceRequestCommand
	| ReopenServiceRequestCommand
	| DeleteServiceRequestCommand
	| CreateNotificationTypeCommand
	| UpdateNotificationTypeCommand
	| DeactivateNotificationTypeCommand
	| ReactivateNotificationTypeCommand
	| DeleteNotificationTypeCommand
	| CreateNotificationRegistrationCommand
	| UpdateNotificationRegistrationContactCommand
	| UpdateNotificationRegistrationLocationCommand
	| UpdateNotificationRegistrationBufferCommand
	| UpdateNotificationRegistrationFlagsCommand
	| DeactivateNotificationRegistrationCommand
	| ReactivateNotificationRegistrationCommand
	| DeleteNotificationRegistrationCommand
	| SubscribeNotificationRegistrationTypeCommand
	| UnsubscribeNotificationRegistrationTypeCommand
	| GenerateMissionNotificationsCommand
	| CompleteMissionNotificationCommand
	| FailMissionNotificationCommand
	| SkipMissionNotificationCommand
	| ReopenMissionNotificationCommand;

const REQUEST_INTAKE_TYPES = ['online', 'phone', 'walk-in', 'other'] as const;
export const NOTIFICATION_CHANNELS = ['email', 'sms', 'phone'] as const;
export const MISSION_NOTIFICATION_STATUSES = ['pending', 'completed', 'failed', 'skipped'] as const;
const REGISTRATION_GEOMETRY_TYPES = ['Point', 'LineString', 'Polygon'] as const;

export function createContactCommand(input: CreateContactCommandInput): CreateContactCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.contactId, 'contactId', issues);
	const details = normalizeCreateContactDetails(input, 'contact', issues);
	throwIfIssues('Create contact command is invalid.', issues);
	return {
		type: 'publicEngagement.createContact',
		payload: { ...basePayload(input), contactId: normalizeRequiredId(input.contactId), ...details },
	};
}

export function updateContactDetailsCommand(
	input: UpdateContactDetailsCommandInput,
): UpdateContactDetailsCommand {
	const issues = validateIdCommand(input, 'contactId');
	const hasName = input.contactName !== undefined;
	const hasCompany = input.company !== undefined;
	const hasDepartment = input.department !== undefined;
	const hasTitle = input.title !== undefined;
	if (!hasName && !hasCompany && !hasDepartment && !hasTitle) {
		issues.push({ path: 'changes', message: 'At least one contact detail must change.' });
	}
	const contactName = hasName
		? normalizeNullableText(input.contactName, 'contactName', issues, 200)
		: undefined;
	const company = hasCompany
		? normalizeNullableText(input.company, 'company', issues, 200)
		: undefined;
	const department = hasDepartment
		? normalizeNullableText(input.department, 'department', issues, 200)
		: undefined;
	const title = hasTitle ? normalizeNullableText(input.title, 'title', issues, 200) : undefined;
	throwIfIssues('Update contact details command is invalid.', issues);
	return {
		type: 'publicEngagement.updateContactDetails',
		payload: {
			...basePayload(input),
			contactId: normalizeRequiredId(input.contactId),
			changes: {
				...(hasName ? { contactName: contactName ?? null } : {}),
				...(hasCompany ? { company: company ?? null } : {}),
				...(hasDepartment ? { department: department ?? null } : {}),
				...(hasTitle ? { title: title ?? null } : {}),
			},
		},
	};
}

export function updateContactCommunicationCommand(
	input: UpdateContactCommunicationCommandInput,
): UpdateContactCommunicationCommand {
	const issues = validateIdCommand(input, 'contactId');
	const hasPreferred = input.preferredPhone !== undefined;
	const hasAlternate = input.alternatePhone !== undefined;
	const hasEmail = input.email !== undefined;
	const hasWantsEmail = input.wantsEmail !== undefined;
	const hasWantsSms = input.wantsSms !== undefined;
	const hasWantsPhone = input.wantsPhone !== undefined;
	if (
		!hasPreferred &&
		!hasAlternate &&
		!hasEmail &&
		!hasWantsEmail &&
		!hasWantsSms &&
		!hasWantsPhone
	) {
		issues.push({
			path: 'changes',
			message: 'At least one contact communication field must change.',
		});
	}
	const preferredPhone = hasPreferred
		? normalizeNullableText(input.preferredPhone, 'preferredPhone', issues, 100)
		: undefined;
	const alternatePhone = hasAlternate
		? normalizeNullableText(input.alternatePhone, 'alternatePhone', issues, 100)
		: undefined;
	const email = hasEmail ? normalizeEmail(input.email, 'email', issues) : undefined;
	if (hasPreferred && preferredPhone === null && hasAlternate && alternatePhone !== null) {
		issues.push({
			path: 'alternatePhone',
			message: 'alternatePhone cannot be set without preferredPhone.',
		});
	}
	if (hasWantsEmail) {
		validateBoolean(input.wantsEmail, 'wantsEmail', issues);
		if (input.wantsEmail === true && hasEmail && email === null) {
			issues.push({ path: 'wantsEmail', message: 'wantsEmail requires email.' });
		}
	}
	validatePhonePreferencePatch(
		input.wantsSms,
		hasWantsSms,
		preferredPhone,
		hasPreferred,
		'wantsSms',
		issues,
	);
	validatePhonePreferencePatch(
		input.wantsPhone,
		hasWantsPhone,
		preferredPhone,
		hasPreferred,
		'wantsPhone',
		issues,
	);
	throwIfIssues('Update contact communication command is invalid.', issues);
	return {
		type: 'publicEngagement.updateContactCommunication',
		payload: {
			...basePayload(input),
			contactId: normalizeRequiredId(input.contactId),
			changes: {
				...(hasPreferred ? { preferredPhone: preferredPhone ?? null } : {}),
				...(hasAlternate ? { alternatePhone: alternatePhone ?? null } : {}),
				...(hasEmail ? { email: email ?? null } : {}),
				...(hasWantsEmail ? { wantsEmail: input.wantsEmail === true } : {}),
				...(hasWantsSms ? { wantsSms: input.wantsSms === true } : {}),
				...(hasWantsPhone ? { wantsPhone: input.wantsPhone === true } : {}),
			},
		},
	};
}

export function mergeContactsCommand(input: MergeContactsCommandInput): MergeContactsCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.targetContactId, 'targetContactId', issues);
	const sourceContactIds = validateIdList(input.sourceContactIds, 'sourceContactIds', issues);
	if (sourceContactIds.includes(normalizeRequiredId(input.targetContactId))) {
		issues.push({
			path: 'sourceContactIds',
			message: 'targetContactId cannot be a source contact.',
		});
	}
	if (input.acknowledgedContactMerge !== true) {
		issues.push({
			path: 'acknowledgedContactMerge',
			message: 'Contact merge acknowledgement is required.',
		});
	}
	throwIfIssues('Merge contacts command is invalid.', issues);
	return {
		type: 'publicEngagement.mergeContacts',
		payload: {
			...basePayload(input),
			targetContactId: normalizeRequiredId(input.targetContactId),
			sourceContactIds,
			acknowledgedContactMerge: true,
		},
	};
}

export function deleteContactCommand(input: ContactIdCommandInput): DeleteContactCommand {
	const issues = validateIdCommand(input, 'contactId');
	throwIfIssues('Delete contact command is invalid.', issues);
	return {
		type: 'publicEngagement.deleteContact',
		payload: { ...basePayload(input), contactId: normalizeRequiredId(input.contactId) },
	};
}

export function createServiceRequestCommand(
	input: CreateServiceRequestCommandInput,
): CreateServiceRequestCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.serviceRequestId, 'serviceRequestId', issues);
	const contact = validateContactReference(input.contact, 'contact', issues);
	const location = validateServiceRequestLocation(input.location, 'location', issues);
	const intakeType = normalizeStringUnion(
		input.intakeType,
		REQUEST_INTAKE_TYPES,
		'intakeType',
		issues,
	);
	validateLocalDate(input.requestDate, 'requestDate', issues);
	const details = normalizeRequiredText(input.details, 'details', issues, 10_000);
	const receivedByProfileId =
		input.receivedByProfileId === undefined
			? normalizeRequiredId(input.actorProfileId)
			: normalizeOptionalUuid(input.receivedByProfileId, 'receivedByProfileId', issues);
	throwIfIssues('Create service request command is invalid.', issues);
	return {
		type: 'publicEngagement.createServiceRequest',
		payload: {
			...basePayload(input),
			serviceRequestId: normalizeRequiredId(input.serviceRequestId),
			contact,
			location,
			intakeType,
			requestDate: input.requestDate,
			details,
			receivedByProfileId,
		},
	};
}

export function updateServiceRequestDetailsCommand(
	input: UpdateServiceRequestDetailsCommandInput,
): UpdateServiceRequestDetailsCommand {
	const issues = validateIdCommand(input, 'serviceRequestId');
	const hasRequestDate = input.requestDate !== undefined;
	const hasIntakeType = input.intakeType !== undefined;
	const hasReceivedBy = input.receivedByProfileId !== undefined;
	const hasDetails = input.details !== undefined;
	if (!hasRequestDate && !hasIntakeType && !hasReceivedBy && !hasDetails) {
		issues.push({ path: 'changes', message: 'At least one service request detail must change.' });
	}
	if (hasRequestDate) {
		validateLocalDate(input.requestDate, 'requestDate', issues);
	}
	const intakeType = hasIntakeType
		? normalizeStringUnion(input.intakeType, REQUEST_INTAKE_TYPES, 'intakeType', issues)
		: undefined;
	const receivedByProfileId = hasReceivedBy
		? normalizeOptionalUuid(input.receivedByProfileId, 'receivedByProfileId', issues)
		: undefined;
	const details = hasDetails
		? normalizeRequiredText(input.details, 'details', issues, 10_000)
		: undefined;
	throwIfIssues('Update service request details command is invalid.', issues);
	const changes: UpdateServiceRequestDetailsCommand['payload']['changes'] = {
		...(hasRequestDate ? { requestDate: input.requestDate as LocalDateString } : {}),
		...(hasIntakeType ? { intakeType: intakeType as RequestIntakeType } : {}),
		...(hasReceivedBy ? { receivedByProfileId: receivedByProfileId ?? null } : {}),
		...(hasDetails ? { details: details as string } : {}),
	};
	return {
		type: 'publicEngagement.updateServiceRequestDetails',
		payload: {
			...basePayload(input),
			serviceRequestId: normalizeRequiredId(input.serviceRequestId),
			changes,
			acknowledgedClosedRequestChange: input.acknowledgedClosedRequestChange ?? false,
		},
	};
}

export function updateServiceRequestContactCommand(
	input: UpdateServiceRequestContactCommandInput,
): UpdateServiceRequestContactCommand {
	const issues = validateIdCommand(input, 'serviceRequestId');
	const contact = validateContactReference(input.contact, 'contact', issues);
	throwIfIssues('Update service request contact command is invalid.', issues);
	return {
		type: 'publicEngagement.updateServiceRequestContact',
		payload: {
			...basePayload(input),
			serviceRequestId: normalizeRequiredId(input.serviceRequestId),
			contact,
			acknowledgedHistoricalContactChange: input.acknowledgedHistoricalContactChange ?? false,
		},
	};
}

export function updateServiceRequestLocationCommand(
	input: UpdateServiceRequestLocationCommandInput,
): UpdateServiceRequestLocationCommand {
	const issues = validateIdCommand(input, 'serviceRequestId');
	const location = validateServiceRequestLocation(input.location, 'location', issues);
	throwIfIssues('Update service request location command is invalid.', issues);
	return {
		type: 'publicEngagement.updateServiceRequestLocation',
		payload: {
			...basePayload(input),
			serviceRequestId: normalizeRequiredId(input.serviceRequestId),
			location,
			acknowledgedHistoricalLocationChange: input.acknowledgedHistoricalLocationChange ?? false,
		},
	};
}

export function closeServiceRequestCommand(
	input: CloseServiceRequestCommandInput,
): CloseServiceRequestCommand {
	const issues = validateIdCommand(input, 'serviceRequestId');
	requireUuid(input.resolutionCommentId, 'resolutionCommentId', issues);
	const resolutionSummary = normalizeRequiredText(
		input.resolutionSummary,
		'resolutionSummary',
		issues,
		10_000,
	);
	const closedAt = normalizeOptionalTimestamp(input.closedAt, 'closedAt', issues);
	throwIfIssues('Close service request command is invalid.', issues);
	return {
		type: 'publicEngagement.closeServiceRequest',
		payload: {
			...basePayload(input),
			serviceRequestId: normalizeRequiredId(input.serviceRequestId),
			resolutionCommentId: normalizeRequiredId(input.resolutionCommentId),
			resolutionSummary,
			closedAt,
		},
	};
}

export function reopenServiceRequestCommand(
	input: ReopenServiceRequestCommandInput,
): ReopenServiceRequestCommand {
	const issues = validateIdCommand(input, 'serviceRequestId');
	requireUuid(input.reopenCommentId, 'reopenCommentId', issues);
	const reopenReason = normalizeRequiredText(input.reopenReason, 'reopenReason', issues, 10_000);
	const reopenedAt = normalizeOptionalTimestamp(input.reopenedAt, 'reopenedAt', issues);
	throwIfIssues('Reopen service request command is invalid.', issues);
	return {
		type: 'publicEngagement.reopenServiceRequest',
		payload: {
			...basePayload(input),
			serviceRequestId: normalizeRequiredId(input.serviceRequestId),
			reopenCommentId: normalizeRequiredId(input.reopenCommentId),
			reopenReason,
			reopenedAt,
		},
	};
}

export function deleteServiceRequestCommand(
	input: DeleteServiceRequestCommandInput,
): DeleteServiceRequestCommand {
	const issues = validateIdCommand(input, 'serviceRequestId');
	throwIfIssues('Delete service request command is invalid.', issues);
	return {
		type: 'publicEngagement.deleteServiceRequest',
		payload: {
			...basePayload(input),
			serviceRequestId: normalizeRequiredId(input.serviceRequestId),
			acknowledgedClosedRequestDeletion: input.acknowledgedClosedRequestDeletion ?? false,
			acknowledgedAssignmentItemDeletion: input.acknowledgedAssignmentItemDeletion ?? false,
		},
	};
}

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

function validateBase(input: PublicEngagementCommandInput, issues: DomainValidationIssue[]): void {
	requireUuid(input.organizationId, 'organizationId', issues);
	requireUuid(input.actorProfileId, 'actorProfileId', issues);
}

function validateIdCommand<T extends PublicEngagementCommandInput>(
	input: T,
	idKey: keyof T & string,
): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input[idKey] as string | undefined, idKey, issues);
	return issues;
}

function basePayload(input: PublicEngagementCommandInput): PublicEngagementCommandPayload {
	return {
		organizationId: normalizeRequiredId(input.organizationId),
		actorProfileId: normalizeRequiredId(input.actorProfileId),
	};
}

function validateContactReference(
	input: ContactReferenceInput,
	path: string,
	issues: DomainValidationIssue[],
): ContactReference {
	if (!isRecord(input)) {
		issues.push({ path, message: `${path} must be a contact reference.` });
		return { kind: 'existing', contactId: '' };
	}
	if (input.kind === 'existing') {
		requireUuid(input.contactId, `${path}.contactId`, issues);
		return { kind: 'existing', contactId: normalizeRequiredId(input.contactId) };
	}
	if (input.kind === 'new') {
		requireUuid(input.contactId, `${path}.contactId`, issues);
		const details = normalizeCreateContactDetails(input.details, `${path}.details`, issues);
		return { kind: 'new', contactId: normalizeRequiredId(input.contactId), details };
	}
	issues.push({ path: `${path}.kind`, message: `${path}.kind is not supported.` });
	return { kind: 'existing', contactId: '' };
}

function validateServiceRequestLocation(
	input: ServiceRequestLocationInput,
	path: string,
	issues: DomainValidationIssue[],
): ServiceRequestLocation {
	if (!isRecord(input)) {
		issues.push({ path, message: `${path} must be a service request location.` });
		return {
			address: { kind: 'existing', addressId: '' },
			geometry: { type: 'Point', coordinates: [0, 0] },
		};
	}
	return {
		address: validateServiceRequestAddress(input.address, `${path}.address`, issues),
		geometry: validatePointGeometry(input.geometry, `${path}.geometry`, issues),
	};
}

function validateServiceRequestAddress(
	input: ServiceRequestAddressInput,
	path: string,
	issues: DomainValidationIssue[],
): ServiceRequestAddress {
	if (!isRecord(input)) {
		issues.push({ path, message: `${path} must be an address reference.` });
		return { kind: 'existing', addressId: '' };
	}
	if (input.kind === 'existing') {
		requireUuid(input.addressId, `${path}.addressId`, issues);
		return { kind: 'existing', addressId: normalizeRequiredId(input.addressId) };
	}
	if (input.kind === 'new') {
		requireUuid(input.addressId, `${path}.addressId`, issues);
		const details = normalizeInlineAddressDetails(input.details, `${path}.details`, issues);
		return { kind: 'new', addressId: normalizeRequiredId(input.addressId), details };
	}
	issues.push({ path: `${path}.kind`, message: `${path}.kind is not supported.` });
	return { kind: 'existing', addressId: '' };
}

function validateNotificationRegistrationLocation(
	input: NotificationRegistrationLocationInput,
	path: string,
	issues: DomainValidationIssue[],
): NotificationRegistrationLocation {
	if (!isRecord(input)) {
		issues.push({ path, message: `${path} must be a notification registration location.` });
		return { address: { kind: 'none' }, geometry: { type: 'Point', coordinates: [0, 0] } };
	}
	return {
		address: validateNotificationAddress(
			input.address ?? { kind: 'none' },
			`${path}.address`,
			issues,
		),
		geometry: validateRegistrationGeometry(input.geometry, `${path}.geometry`, issues),
	};
}

function validateNotificationAddress(
	input: NotificationRegistrationAddressInput,
	path: string,
	issues: DomainValidationIssue[],
): NotificationRegistrationAddress {
	if (!isRecord(input)) {
		issues.push({ path, message: `${path} must be an address reference.` });
		return { kind: 'none' };
	}
	if (input.kind === 'none') {
		return { kind: 'none' };
	}
	if (input.kind === 'existing') {
		requireUuid(input.addressId, `${path}.addressId`, issues);
		return { kind: 'existing', addressId: normalizeRequiredId(input.addressId) };
	}
	if (input.kind === 'new') {
		requireUuid(input.addressId, `${path}.addressId`, issues);
		const details = normalizeInlineAddressDetails(input.details, `${path}.details`, issues);
		return { kind: 'new', addressId: normalizeRequiredId(input.addressId), details };
	}
	issues.push({ path: `${path}.kind`, message: `${path}.kind is not supported.` });
	return { kind: 'none' };
}

function normalizeCreateContactDetails(
	input: CreateContactDetailsInput,
	path: string,
	issues: DomainValidationIssue[],
): CreateContactDetails {
	if (!isRecord(input)) {
		issues.push({ path, message: `${path} must be a contact details object.` });
		return emptyContactDetails();
	}
	const contactInput = input as CreateContactDetailsInput;
	const contactName = normalizeNullableText(
		contactInput.contactName,
		`${path}.contactName`,
		issues,
		200,
	);
	const preferredPhone = normalizeNullableText(
		contactInput.preferredPhone,
		`${path}.preferredPhone`,
		issues,
		100,
	);
	const alternatePhone = normalizeNullableText(
		contactInput.alternatePhone,
		`${path}.alternatePhone`,
		issues,
		100,
	);
	const email = normalizeEmail(contactInput.email, `${path}.email`, issues);
	const company = normalizeNullableText(contactInput.company, `${path}.company`, issues, 200);
	const department = normalizeNullableText(
		contactInput.department,
		`${path}.department`,
		issues,
		200,
	);
	const title = normalizeNullableText(contactInput.title, `${path}.title`, issues, 200);
	const wantsEmail = normalizeBooleanDefault(
		contactInput.wantsEmail,
		`${path}.wantsEmail`,
		issues,
		false,
	);
	const wantsSms = normalizeBooleanDefault(
		contactInput.wantsSms,
		`${path}.wantsSms`,
		issues,
		false,
	);
	const wantsPhone = normalizeBooleanDefault(
		contactInput.wantsPhone,
		`${path}.wantsPhone`,
		issues,
		false,
	);
	if (
		contactName === null &&
		preferredPhone === null &&
		alternatePhone === null &&
		email === null &&
		company === null
	) {
		issues.push({
			path,
			message: `${path} requires contactName, company, preferredPhone, alternatePhone, or email.`,
		});
	}
	if (alternatePhone !== null && preferredPhone === null) {
		issues.push({
			path: `${path}.alternatePhone`,
			message: 'alternatePhone cannot be set without preferredPhone.',
		});
	}
	if (wantsEmail && email === null) {
		issues.push({ path: `${path}.wantsEmail`, message: 'wantsEmail requires email.' });
	}
	if (wantsSms && preferredPhone === null) {
		issues.push({ path: `${path}.wantsSms`, message: 'wantsSms requires preferredPhone.' });
	}
	if (wantsPhone && preferredPhone === null) {
		issues.push({ path: `${path}.wantsPhone`, message: 'wantsPhone requires preferredPhone.' });
	}
	return {
		contactName,
		preferredPhone,
		alternatePhone,
		email,
		company,
		department,
		title,
		wantsEmail,
		wantsSms,
		wantsPhone,
	};
}

function emptyContactDetails(): CreateContactDetails {
	return {
		contactName: null,
		preferredPhone: null,
		alternatePhone: null,
		email: null,
		company: null,
		department: null,
		title: null,
		wantsEmail: false,
		wantsSms: false,
		wantsPhone: false,
	};
}

function normalizeInlineAddressDetails(
	input: CreateInlineAddressDetailsInput,
	path: string,
	issues: DomainValidationIssue[],
): CreateInlineAddressDetails {
	if (!isRecord(input)) {
		issues.push({ path, message: `${path} must be an address details object.` });
		return {
			displayName: '',
			geometry: { type: 'Point', coordinates: [0, 0] },
			country: 'US',
			addressLine1: null,
			addressLine2: null,
			locality: null,
			region: null,
			postalCode: null,
			geocoderResponse: null,
		};
	}
	return {
		displayName: normalizeRequiredText(input.displayName, `${path}.displayName`, issues, 200),
		geometry: validatePointGeometry(input.geometry, `${path}.geometry`, issues),
		country: normalizeCountry(input.country, `${path}.country`, issues),
		addressLine1: normalizeNullableText(input.addressLine1, `${path}.addressLine1`, issues, 200),
		addressLine2: normalizeNullableText(input.addressLine2, `${path}.addressLine2`, issues, 200),
		locality: normalizeNullableText(input.locality, `${path}.locality`, issues, 200),
		region: normalizeUsRegion(input.region, `${path}.region`, issues),
		postalCode: normalizePostalCode(input.postalCode, `${path}.postalCode`, issues),
		geocoderResponse: normalizeJsonObject(
			input.geocoderResponse,
			`${path}.geocoderResponse`,
			issues,
		),
	};
}

function validateSubscriptionList(
	values: readonly NotificationRegistrationSubscriptionInput[],
	path: string,
	issues: DomainValidationIssue[],
): readonly NotificationRegistrationSubscription[] {
	if (!Array.isArray(values)) {
		issues.push({ path, message: `${path} must be an array.` });
		return [];
	}
	const rowIds = new Set<string>();
	const typeIds = new Set<string>();
	return values.map((value, index) => {
		requireUuid(
			value.notificationRegistrationTypeId,
			`${path}.${index}.notificationRegistrationTypeId`,
			issues,
		);
		requireUuid(value.notificationTypeId, `${path}.${index}.notificationTypeId`, issues);
		const notificationRegistrationTypeId = normalizeRequiredId(
			value.notificationRegistrationTypeId,
		);
		const notificationTypeId = normalizeRequiredId(value.notificationTypeId);
		if (rowIds.has(notificationRegistrationTypeId)) {
			issues.push({
				path: `${path}.${index}.notificationRegistrationTypeId`,
				message: 'notificationRegistrationTypeId values must be unique.',
			});
		}
		if (typeIds.has(notificationTypeId)) {
			issues.push({
				path: `${path}.${index}.notificationTypeId`,
				message: 'notificationTypeId values must be unique.',
			});
		}
		rowIds.add(notificationRegistrationTypeId);
		typeIds.add(notificationTypeId);
		return { notificationRegistrationTypeId, notificationTypeId };
	});
}

function normalizeBuffer(
	input: { readonly bufferDistance?: number | null; readonly bufferUnitId?: DomainId | null },
	issues: DomainValidationIssue[],
): { readonly bufferDistance: number | null; readonly bufferUnitId: DomainId | null } {
	const hasDistance = input.bufferDistance !== undefined && input.bufferDistance !== null;
	const hasUnit = normalizeOptionalId(input.bufferUnitId) !== null;
	if (hasDistance !== hasUnit) {
		issues.push({
			path: 'buffer',
			message: 'bufferDistance and bufferUnitId must be provided together or cleared together.',
		});
	}
	let bufferDistance: number | null = null;
	if (hasDistance) {
		if (
			typeof input.bufferDistance !== 'number' ||
			!Number.isFinite(input.bufferDistance) ||
			input.bufferDistance <= 0
		) {
			issues.push({ path: 'bufferDistance', message: 'bufferDistance must be a positive number.' });
		} else {
			bufferDistance = input.bufferDistance;
		}
	}
	const bufferUnitId = normalizeOptionalUuid(input.bufferUnitId, 'bufferUnitId', issues);
	return { bufferDistance, bufferUnitId };
}

function validateRegistrationPurpose(
	hasSubscriptions: boolean,
	hasBees: boolean,
	isNoSpray: boolean,
	path: string,
	issues: DomainValidationIssue[],
): void {
	if (!hasSubscriptions && !hasBees && !isNoSpray) {
		issues.push({
			path,
			message: 'Notification registration requires a subscription, hasBees, or isNoSpray.',
		});
	}
}

function validatePhonePreferencePatch(
	value: boolean | undefined,
	hasValue: boolean,
	preferredPhone: string | null | undefined,
	hasPreferredPhone: boolean,
	path: string,
	issues: DomainValidationIssue[],
): void {
	if (!hasValue) {
		return;
	}
	validateBoolean(value, path, issues);
	if (value === true && hasPreferredPhone && preferredPhone === null) {
		issues.push({ path, message: `${path} requires preferredPhone.` });
	}
}

function validatePointGeometry(
	value: unknown,
	path: string,
	issues: DomainValidationIssue[],
): GeoJsonPoint {
	try {
		return normalizePointGeometry(value, path);
	} catch (error) {
		if (error instanceof DomainValidationError) {
			issues.push(...error.issues);
			return { type: 'Point', coordinates: [0, 0] };
		}
		throw error;
	}
}

function validateRegistrationGeometry(
	value: unknown,
	path: string,
	issues: DomainValidationIssue[],
): NotificationRegistrationGeometry {
	try {
		return normalizeGeometry(value, REGISTRATION_GEOMETRY_TYPES, path);
	} catch (error) {
		if (error instanceof DomainValidationError) {
			issues.push(...error.issues);
			return { type: 'Point', coordinates: [0, 0] };
		}
		throw error;
	}
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

function normalizeOptionalTimestamp(
	value: Date | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): Date | null {
	if (value === undefined || value === null) {
		return null;
	}
	if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
		issues.push({ path, message: `${path} must be a valid Date.` });
		return null;
	}
	if (value.getTime() > Date.now()) {
		issues.push({ path, message: `${path} cannot be in the future.` });
	}
	return value;
}

function normalizeCountry(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): 'US' {
	const normalized = value === undefined || value === null ? 'US' : value.trim().toUpperCase();
	if (normalized !== 'US') {
		issues.push({ path, message: `${path} must be US for v1.` });
	}
	return 'US';
}

function normalizeUsRegion(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): string | null {
	const normalized = normalizeNullableText(value, path, issues, 2);
	if (normalized === null) {
		return null;
	}
	const upper = normalized.toUpperCase();
	if (!/^[A-Z]{2}$/.test(upper)) {
		issues.push({ path, message: `${path} must be a two-letter state or territory code.` });
	}
	return upper;
}

function normalizePostalCode(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): string | null {
	const normalized = normalizeNullableText(value, path, issues, 10);
	if (normalized === null) {
		return null;
	}
	if (!/^\d{5}(-\d{4})?$/.test(normalized)) {
		issues.push({ path, message: `${path} must be a ZIP or ZIP+4 postal code.` });
	}
	return normalized;
}

function normalizeEmail(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): string | null {
	const normalized = normalizeNullableText(value, path, issues, 320);
	if (normalized === null) {
		return null;
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
		issues.push({ path, message: `${path} must be a valid email address.` });
	}
	return normalized.toLowerCase();
}

function normalizeJsonObject(
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

function normalizeBooleanDefault(
	value: boolean | undefined,
	path: string,
	issues: DomainValidationIssue[],
	defaultValue: boolean,
): boolean {
	if (value === undefined) {
		return defaultValue;
	}
	validateBoolean(value, path, issues);
	return value === true;
}

function validateBoolean(
	value: boolean | undefined,
	path: string,
	issues: DomainValidationIssue[],
): void {
	if (typeof value !== 'boolean') {
		issues.push({ path, message: `${path} must be a boolean.` });
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createIssues(): DomainValidationIssue[] {
	return [];
}

function throwIfIssues(message: string, issues: readonly DomainValidationIssue[]): void {
	if (issues.length > 0) {
		throw new DomainValidationError(message, issues);
	}
}
