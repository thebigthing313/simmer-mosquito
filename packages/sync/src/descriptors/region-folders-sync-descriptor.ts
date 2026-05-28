import { createSyncDescriptor } from '../descriptor-factory.js';
import type { RegionFolderRow } from '../index.js';

export const regionFoldersSyncDescriptor = createSyncDescriptor<RegionFolderRow>({
	id: 'region_folders',
	table: 'region_folders',
	endpointPath: '/sync/shapes/region-folders',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'name',
		'description',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
