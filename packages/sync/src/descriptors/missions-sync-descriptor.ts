import { createSyncDescriptor } from '../descriptor-factory.js';
import type { MissionRow } from '../index.js';

export const missionsSyncDescriptor = createSyncDescriptor<MissionRow>({
	id: 'missions',
	table: 'missions',
	endpointPath: '/sync/shapes/missions',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'missionName',
		'controlType',
		'plannedMethodId',
		'assignedToProfileId',
		'assignedByProfileId',
		'scheduledStartAt',
		'scheduledEndAt',
		'rainDate',
		'startedAt',
		'completedAt',
		'cancelledAt',
		'cancellationReason',
		'notificationTypeId',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
