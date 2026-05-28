import { createSyncDescriptor } from '../descriptor-factory.js';
import type { HabitatRow } from '../index.js';

export const habitatsSyncDescriptor = createSyncDescriptor<HabitatRow>({
	id: 'habitats',
	table: 'habitats',
	endpointPath: '/sync/shapes/habitats',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'addressId',
		'habitatTypeId',
		'habitatName',
		'description',
		'isActive',
		'isInaccessible',
		'metadata',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
