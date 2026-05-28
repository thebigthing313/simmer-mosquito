import { createSyncDescriptor } from '../descriptor-factory.js';
import type { CollectionMethodRow } from '../index.js';

export const collectionMethodsSyncDescriptor = createSyncDescriptor<CollectionMethodRow>({
	id: 'collection_methods',
	table: 'collection_methods',
	endpointPath: '/sync/shapes/collection-methods',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'name',
		'description',
		'customSchema',
		'actionThreshold',
		'isActive',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
