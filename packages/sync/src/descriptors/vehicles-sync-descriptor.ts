import { createSyncDescriptor } from '../descriptor-factory.js';
import type { VehicleRow } from '../index.js';

export const vehiclesSyncDescriptor = createSyncDescriptor<VehicleRow>({
	id: 'vehicles',
	table: 'vehicles',
	endpointPath: '/sync/shapes/vehicles',
	columns: [
		'id',
		'organizationId',
		'vehicleName',
		'metadata',
		'isActive',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
