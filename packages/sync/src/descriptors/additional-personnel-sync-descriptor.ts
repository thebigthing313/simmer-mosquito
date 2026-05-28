import { createSyncDescriptor } from '../descriptor-factory.js';
import type { AdditionalPersonnelRow } from '../index.js';

export const additionalPersonnelSyncDescriptor = createSyncDescriptor<AdditionalPersonnelRow>({
	id: 'additional_personnel',
	table: 'additional_personnel',
	endpointPath: '/sync/shapes/additional-personnel',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'personnelProfileId',
		'entityType',
		'entityId',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
