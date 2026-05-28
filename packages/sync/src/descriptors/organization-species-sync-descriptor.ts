import { createSyncDescriptor } from '../descriptor-factory.js';
import type { OrganizationSpeciesRow } from '../index.js';

export const organizationSpeciesSyncDescriptor = createSyncDescriptor<OrganizationSpeciesRow>({
	id: 'organization_species',
	table: 'organization_species',
	endpointPath: '/sync/shapes/organization-species',
	syncMode: 'eager',
	columns: ['id', 'organizationId', 'speciesId', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
});
