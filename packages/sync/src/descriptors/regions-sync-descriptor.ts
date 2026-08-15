import { createSyncDescriptor } from '../descriptor-factory.js';
import type { RegionRow } from '../index.js';

export const regionsSyncDescriptor = createSyncDescriptor<RegionRow>({
	id: 'regions',
	table: 'regions',
	endpointPath: '/sync/shapes/regions',
	columns: [
		'id',
		'organizationId',
		'regionFolderId',
		'name',
		'description',
		'metadata',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
