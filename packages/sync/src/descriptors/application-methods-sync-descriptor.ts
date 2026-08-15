import { createSyncDescriptor } from '../descriptor-factory.js';
import type { ControlMethodRow } from '../index.js';

export const applicationMethodsSyncDescriptor = createSyncDescriptor<ControlMethodRow>({
	id: 'application_methods',
	table: 'application_methods',
	endpointPath: '/sync/shapes/application-methods',
	columns: ['id', 'organizationId', 'name', 'customSchema', 'isActive', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
});
