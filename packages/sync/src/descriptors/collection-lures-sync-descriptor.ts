import { createSyncDescriptor } from '../descriptor-factory.js';
import type { CollectionLureRow } from '../index.js';

export const collectionLuresSyncDescriptor = createSyncDescriptor<CollectionLureRow>({
	id: 'collection_lures',
	table: 'collection_lures',
	endpointPath: '/sync/shapes/collection-lures',
	syncMode: 'eager',
	columns: ['id', 'organizationId', 'name', 'description', 'isActive', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
});
