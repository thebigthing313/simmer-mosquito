import { createSyncDescriptor } from '../descriptor-factory.js';
import type { OutreachActionRow } from '../index.js';

export const outreachActionsSyncDescriptor = createSyncDescriptor<OutreachActionRow>({
	id: 'outreach_actions',
	table: 'outreach_actions',
	endpointPath: '/sync/shapes/outreach-actions',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'lat',
		'lng',
		'geomType',
		'outreachMethodId',
		'technicianProfileId',
		'outreachDate',
		'addressId',
		'inspectionId',
		'reach',
		'reachDescription',
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
