import { createSyncDescriptor } from '../descriptor-factory.js';
import type { ApplicationBatchRow } from '../index.js';

export const applicationBatchesSyncDescriptor = createSyncDescriptor<ApplicationBatchRow>({
	id: 'application_batches',
	table: 'application_batches',
	endpointPath: '/sync/shapes/application-batches',
	columns: [
		'id',
		'organizationId',
		'applicationId',
		'insecticideBatchId',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
