import { createSyncDescriptor } from '../descriptor-factory.js';
import type { HabitatTypeRow } from '../index.js';

export const habitatTypesSyncDescriptor = createSyncDescriptor<HabitatTypeRow>({
	id: 'habitat_types',
	table: 'habitat_types',
	endpointPath: '/sync/shapes/habitat-types',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'name',
		'description',
		'customSchema',
		'isActive',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
