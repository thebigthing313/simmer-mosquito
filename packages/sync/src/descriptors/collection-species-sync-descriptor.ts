import { createSyncDescriptor } from '../descriptor-factory.js';
import type { CollectionSpeciesRow } from '../index.js';

export const collectionSpeciesSyncDescriptor = createSyncDescriptor<CollectionSpeciesRow>({
	id: 'collection_species',
	table: 'collection_species',
	endpointPath: '/sync/shapes/collection-species',
	columns: [
		'id',
		'organizationId',
		'collectionId',
		'speciesId',
		'count',
		'sex',
		'status',
		'identifiedByProfileId',
		'identifiedDate',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
