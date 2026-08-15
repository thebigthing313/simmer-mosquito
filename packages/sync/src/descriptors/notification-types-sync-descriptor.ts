import { createSyncDescriptor } from '../descriptor-factory.js';
import type { NotificationTypeRow } from '../index.js';

export const notificationTypesSyncDescriptor = createSyncDescriptor<NotificationTypeRow>({
	id: 'notification_types',
	table: 'notification_types',
	endpointPath: '/sync/shapes/notification-types',
	columns: ['id', 'organizationId', 'name', 'description', 'isActive', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
});
