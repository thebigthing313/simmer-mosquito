import { createSyncDescriptor } from '../descriptor-factory.js';
import type { NotificationRegistrationTypeRow } from '../index.js';

export const notificationRegistrationTypesSyncDescriptor =
	createSyncDescriptor<NotificationRegistrationTypeRow>({
		id: 'notification_registration_types',
		table: 'notification_registration_types',
		endpointPath: '/sync/shapes/notification-registration-types',
		columns: [
			'id',
			'organizationId',
			'notificationRegistrationId',
			'notificationTypeId',
			'createdByProfileId',
			'updatedByProfileId',
			'createdAt',
			'updatedAt',
		],
		getKey: (row) => row.id,
	});
