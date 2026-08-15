import { createSyncDescriptor } from '../descriptor-factory.js';
import type { AssignmentRow } from '../index.js';

export const assignmentsSyncDescriptor = createSyncDescriptor<AssignmentRow>({
	id: 'assignments',
	table: 'assignments',
	endpointPath: '/sync/shapes/assignments',
	columns: [
		'id',
		'organizationId',
		'assignmentName',
		'assignedToProfileId',
		'assignedByProfileId',
		'assignmentDate',
		'dueAt',
		'startedAt',
		'completedAt',
		'cancelledAt',
		'cancellationReason',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
