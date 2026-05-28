import { createSyncDescriptor } from '../descriptor-factory.js';
import type { TagRow } from '../index.js';

export const tagsSyncDescriptor = createSyncDescriptor<TagRow>({
	id: 'tags',
	table: 'tags',
	endpointPath: '/sync/shapes/tags',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'tagName',
		'description',
		'color',
		'isActive',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
