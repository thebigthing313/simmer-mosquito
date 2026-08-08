import { createSyncDescriptor } from '../descriptor-factory.js';
import type { SpeciesRow } from '../index.js';

export const speciesSyncDescriptor = createSyncDescriptor<SpeciesRow>({
	id: 'species',
	table: 'species',
	endpointPath: '/sync/shapes/species',
	syncMode: 'eager',
	scope: 'global',
	columns: ['id', 'genusId', 'epithet', 'commonName', 'displayName', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
});
