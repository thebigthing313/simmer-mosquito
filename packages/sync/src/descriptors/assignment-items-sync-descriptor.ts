import { createSyncDescriptor } from '../descriptor-factory.js';
import type { AssignmentItemRow } from '../index.js';

export const assignmentItemsSyncDescriptor = createSyncDescriptor<AssignmentItemRow>({
	id: 'assignment_items',
	table: 'assignment_items',
	endpointPath: '/sync/shapes/assignment-items',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'assignmentId',
		'entityType',
		'entityId',
		'position',
		'directionsToNextItem',
		'completedAt',
		'completedByProfileId',
		'skippedAt',
		'skippedByProfileId',
		'skipReason',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
