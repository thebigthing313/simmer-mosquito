import { createSyncDescriptor } from '../descriptor-factory.js';
import type { SourceReductionRow } from '../index.js';

export const sourceReductionsSyncDescriptor = createSyncDescriptor<SourceReductionRow>({
	id: 'source_reductions',
	table: 'source_reductions',
	endpointPath: '/sync/shapes/source-reductions',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'sourceReductionMethodId',
		'technicianProfileId',
		'sourceReductionDate',
		'addressId',
		'habitatId',
		'sourcesEliminatedAmount',
		'sourcesEliminatedUnitId',
		'inspectionId',
		'requestedControlActionId',
		'missionItemId',
		'metadata',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
