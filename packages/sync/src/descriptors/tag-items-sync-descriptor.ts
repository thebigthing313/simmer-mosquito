import { createSyncDescriptor } from '../descriptor-factory.js';
import type { TagItemRow } from '../index.js';

export const tagItemsSyncDescriptor = createSyncDescriptor<TagItemRow>({
	id: 'tag_items',
	table: 'tag_items',
	endpointPath: '/sync/shapes/tag-items',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'tagId',
		'entityType',
		'entityId',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
