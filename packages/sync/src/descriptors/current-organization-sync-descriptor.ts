import { createSyncDescriptor } from '../descriptor-factory.js';
import type { OrganizationRow } from '../index.js';

export const currentOrganizationSyncDescriptor = createSyncDescriptor<OrganizationRow>({
	id: 'current_organization',
	table: 'organizations',
	endpointPath: '/sync/shapes/organization',
	columns: [
		'id',
		'workosOrganizationId',
		'name',
		'slug',
		'mainContactEmail',
		'phoneNumber',
		'mailingCountry',
		'mailingAddressLine1',
		'mailingAddressLine2',
		'mailingLocality',
		'mailingRegion',
		'mailingPostalCode',
		'settings',
		'updatedAt',
		'updatedByProfileId',
	],
	getKey: (row) => row.id,
});
