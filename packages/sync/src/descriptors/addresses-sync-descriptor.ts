import { createSyncDescriptor } from '../descriptor-factory.js';
import type { AddressRow } from '../index.js';

export const addressesSyncDescriptor = createSyncDescriptor<AddressRow>({
	id: 'addresses',
	table: 'addresses',
	endpointPath: '/sync/shapes/addresses',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'displayName',
		'country',
		'addressLine1',
		'addressLine2',
		'locality',
		'region',
		'postalCode',
		'geocoderResponse',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
