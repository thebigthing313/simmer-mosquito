import { createSyncDescriptor } from '../descriptor-factory.js';
import type { SampleSpeciesRow } from '../index.js';

export const sampleSpeciesSyncDescriptor = createSyncDescriptor<SampleSpeciesRow>({
	id: 'sample_species',
	table: 'sample_species',
	endpointPath: '/sync/shapes/sample-species',
	columns: [
		'id',
		'organizationId',
		'sampleId',
		'speciesId',
		'identifiedByProfileId',
		'identifiedAt',
		'larvaeCount',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
