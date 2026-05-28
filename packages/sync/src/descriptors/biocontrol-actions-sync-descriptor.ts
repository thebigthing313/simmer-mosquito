import { createSyncDescriptor } from '../descriptor-factory.js';
import type { BiocontrolActionRow } from '../index.js';

export const biocontrolActionsSyncDescriptor = createSyncDescriptor<BiocontrolActionRow>({
	id: 'biocontrol_actions',
	table: 'biocontrol_actions',
	endpointPath: '/sync/shapes/biocontrol-actions',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'biocontrolMethodId',
		'technicianProfileId',
		'biocontrolDate',
		'addressId',
		'habitatId',
		'inspectionId',
		'amountReleased',
		'releaseUnitId',
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
