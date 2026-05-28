import { createSyncDescriptor } from '../descriptor-factory.js';
import type { MissionNotificationRow } from '../index.js';

export const missionNotificationsSyncDescriptor = createSyncDescriptor<MissionNotificationRow>({
	id: 'mission_notifications',
	table: 'mission_notifications',
	endpointPath: '/sync/shapes/mission-notifications',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'missionId',
		'notificationRegistrationId',
		'contactId',
		'notificationTypeId',
		'channel',
		'destination',
		'status',
		'statusChangedAt',
		'statusChangedByProfileId',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
