import { createSyncDescriptor } from '../descriptor-factory.js';
import type { ServiceRequestRow } from '../index.js';

export const serviceRequestsSyncDescriptor = createSyncDescriptor<ServiceRequestRow>({
	id: 'service_requests',
	table: 'service_requests',
	endpointPath: '/sync/shapes/service-requests',
	columns: [
		'id',
		'organizationId',
		'lat',
		'lng',
		'geomType',
		'displayName',
		'intakeType',
		'requestDate',
		'addressId',
		'contactId',
		'receivedByProfileId',
		'details',
		'closedAt',
		'closedByProfileId',
		'metadata',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
