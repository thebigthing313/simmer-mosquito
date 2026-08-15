import { createSyncDescriptor } from '../descriptor-factory.js';
import type { ControlMethodRow } from '../index.js';

export const outreachMethodsSyncDescriptor = createSyncDescriptor<ControlMethodRow>({
	id: 'outreach_methods',
	table: 'outreach_methods',
	endpointPath: '/sync/shapes/outreach-methods',
	columns: ['id', 'organizationId', 'name', 'customSchema', 'isActive', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
});
