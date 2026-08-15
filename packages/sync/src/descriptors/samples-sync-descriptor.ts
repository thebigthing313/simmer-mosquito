import { createSyncDescriptor } from '../descriptor-factory.js';
import type { SampleRow } from '../index.js';

export const samplesSyncDescriptor = createSyncDescriptor<SampleRow>({
	id: 'samples',
	table: 'samples',
	endpointPath: '/sync/shapes/samples',
	columns: [
		'id',
		'organizationId',
		'inspectionId',
		'displayName',
		'isZeroLarvae',
		'hasNonMosquito',
		'unidentifiableReason',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
