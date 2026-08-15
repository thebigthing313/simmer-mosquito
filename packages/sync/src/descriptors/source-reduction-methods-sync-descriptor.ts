import { createSyncDescriptor } from '../descriptor-factory.js';
import type { ControlMethodRow } from '../index.js';

export const sourceReductionMethodsSyncDescriptor = createSyncDescriptor<ControlMethodRow>({
	id: 'source_reduction_methods',
	table: 'source_reduction_methods',
	endpointPath: '/sync/shapes/source-reduction-methods',
	columns: ['id', 'organizationId', 'name', 'customSchema', 'isActive', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
});
