import { createSyncDescriptor } from '../descriptor-factory.js';
import type { MissionItemRow } from '../index.js';

export const missionItemsSyncDescriptor = createSyncDescriptor<MissionItemRow>({
	id: 'mission_items',
	table: 'mission_items',
	endpointPath: '/sync/shapes/mission-items',
	columns: [
		'id',
		'organizationId',
		'lat',
		'lng',
		'geomType',
		'missionId',
		'requestedControlActionId',
		'addressId',
		'position',
		'completedAt',
		'completedByProfileId',
		'skippedAt',
		'skippedByProfileId',
		'skipReason',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
