export * from './public-engagement/contacts.js';
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
} from './public-engagement/core.js';
export {
	MISSION_NOTIFICATION_STATUSES,
	NOTIFICATION_CHANNELS,
} from './public-engagement/core.js';
export * from './public-engagement/mission-notifications.js';
export * from './public-engagement/notification-types.js';
export * from './public-engagement/registrations.js';
export * from './public-engagement/service-requests.js';

import type {
	CreateContactCommand,
	DeleteContactCommand,
	MergeContactsCommand,
	UpdateContactCommunicationCommand,
	UpdateContactDetailsCommand,
} from './public-engagement/contacts.js';
import type {
	CompleteMissionNotificationCommand,
	FailMissionNotificationCommand,
	GenerateMissionNotificationsCommand,
	ReopenMissionNotificationCommand,
	SkipMissionNotificationCommand,
} from './public-engagement/mission-notifications.js';
import type {
	CreateNotificationTypeCommand,
	DeactivateNotificationTypeCommand,
	DeleteNotificationTypeCommand,
	ReactivateNotificationTypeCommand,
	UpdateNotificationTypeCommand,
} from './public-engagement/notification-types.js';
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
} from './public-engagement/registrations.js';
import type {
	CloseServiceRequestCommand,
	CreateServiceRequestCommand,
	DeleteServiceRequestCommand,
	ReopenServiceRequestCommand,
	UpdateServiceRequestContactCommand,
	UpdateServiceRequestDetailsCommand,
	UpdateServiceRequestLocationCommand,
} from './public-engagement/service-requests.js';

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
