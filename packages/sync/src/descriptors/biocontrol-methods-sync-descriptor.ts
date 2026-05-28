import { createSyncDescriptor } from '../descriptor-factory.js';
import type { ControlMethodRow } from '../index.js';

export const biocontrolMethodsSyncDescriptor = createSyncDescriptor<ControlMethodRow>({
	id: 'biocontrol_methods',
	table: 'biocontrol_methods',
	endpointPath: '/sync/shapes/biocontrol-methods',
	syncMode: 'eager',
	columns: ['id', 'organizationId', 'name', 'customSchema', 'isActive', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
});
