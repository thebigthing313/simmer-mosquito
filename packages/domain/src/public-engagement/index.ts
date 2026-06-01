export * from './contacts.js';
export type {
	ContactReference,
	ContactReferenceInput,
	CreateContactDetails,
	CreateContactDetailsInput,
	CreateInlineAddressDetails,
	CreateInlineAddressDetailsInput,
	MissionNotificationStatus,
	NotificationChannel,
	NotificationRegistrationAddress,
	NotificationRegistrationAddressInput,
	NotificationRegistrationGeometry,
	NotificationRegistrationLocation,
	NotificationRegistrationLocationInput,
	NotificationRegistrationSubscription,
	NotificationRegistrationSubscriptionInput,
	PublicEngagementCommandType,
	PublicEngagementDomainCommand,
	RequestIntakeType,
	ServiceRequestAddress,
	ServiceRequestAddressInput,
	ServiceRequestLocation,
	ServiceRequestLocationInput,
} from './core.js';
export {
	MISSION_NOTIFICATION_STATUSES,
	NOTIFICATION_CHANNELS,
} from './core.js';
export * from './mission-notifications.js';
export * from './notification-types.js';
export * from './registrations.js';
export * from './service-requests.js';

import type {
	CreateContactCommand,
	DeleteContactCommand,
	MergeContactsCommand,
	UpdateContactCommunicationCommand,
	UpdateContactDetailsCommand,
} from './contacts.js';
import type {
	CompleteMissionNotificationCommand,
	FailMissionNotificationCommand,
	GenerateMissionNotificationsCommand,
	ReopenMissionNotificationCommand,
	SkipMissionNotificationCommand,
} from './mission-notifications.js';
import type {
	CreateNotificationTypeCommand,
	DeactivateNotificationTypeCommand,
	DeleteNotificationTypeCommand,
	ReactivateNotificationTypeCommand,
	UpdateNotificationTypeCommand,
} from './notification-types.js';
import type {
	CreateNotificationRegistrationCommand,
	DeactivateNotificationRegistrationCommand,
	DeleteNotificationRegistrationCommand,
	ReactivateNotificationRegistrationCommand,
	SubscribeNotificationRegistrationTypeCommand,
	UnsubscribeNotificationRegistrationTypeCommand,
	UpdateNotificationRegistrationBufferCommand,
	UpdateNotificationRegistrationContactCommand,
	UpdateNotificationRegistrationFlagsCommand,
	UpdateNotificationRegistrationLocationCommand,
} from './registrations.js';
import type {
	CloseServiceRequestCommand,
	CreateServiceRequestCommand,
	DeleteServiceRequestCommand,
	ReopenServiceRequestCommand,
	UpdateServiceRequestContactCommand,
	UpdateServiceRequestDetailsCommand,
	UpdateServiceRequestLocationCommand,
} from './service-requests.js';

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
