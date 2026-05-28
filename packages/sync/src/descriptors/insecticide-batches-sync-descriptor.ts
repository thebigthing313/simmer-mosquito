import { createSyncDescriptor } from '../descriptor-factory.js';
import type { InsecticideBatchRow } from '../index.js';

export const insecticideBatchesSyncDescriptor = createSyncDescriptor<InsecticideBatchRow>({
	id: 'insecticide_batches',
	table: 'insecticide_batches',
	endpointPath: '/sync/shapes/insecticide-batches',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'insecticideId',
		'batchName',
		'isActive',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
