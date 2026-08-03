import { createSyncDescriptor } from '../descriptor-factory.js';
import type { FormulationRow } from '../index.js';

export const formulationsSyncDescriptor = createSyncDescriptor<FormulationRow>({
	id: 'formulations',
	table: 'formulations',
	endpointPath: '/sync/shapes/formulations',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'formulationName',
		'description',
		'isActive',
		'batchSize',
		'batchUnitId',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
