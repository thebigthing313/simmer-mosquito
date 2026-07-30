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
		// `geom` is a non-null Point, so the trigger-maintained centroid is the
		// address's own coordinate — synced so a picked address can seed a form's
		// geometry without a second round trip. Full geojson stays server-only.
		'lat',
		'lng',
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
