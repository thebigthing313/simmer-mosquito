import { createSyncDescriptor } from '../descriptor-factory.js';
import type { EquipmentRow } from '../index.js';

export const equipmentSyncDescriptor = createSyncDescriptor<EquipmentRow>({
	id: 'equipment',
	table: 'equipment',
	endpointPath: '/sync/shapes/equipment',
	columns: [
		'id',
		'organizationId',
		'equipmentName',
		'serialNumber',
		'metadata',
		'isActive',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
