import { createSyncDescriptor } from '../descriptor-factory.js';
import type { NotificationRegistrationRow } from '../index.js';

export const notificationRegistrationsSyncDescriptor =
	createSyncDescriptor<NotificationRegistrationRow>({
		id: 'notification_registrations',
		table: 'notification_registrations',
		endpointPath: '/sync/shapes/notification-registrations',
		syncMode: 'on-demand',
		columns: [
			'id',
			'organizationId',
			'contactId',
			'addressId',
			'bufferDistance',
			'bufferUnitId',
			'hasBees',
			'isNoSpray',
			'isActive',
			'createdByProfileId',
			'updatedByProfileId',
			'createdAt',
			'updatedAt',
		],
		getKey: (row) => row.id,
	});
