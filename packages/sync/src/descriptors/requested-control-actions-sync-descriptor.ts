import { createSyncDescriptor } from '../descriptor-factory.js';
import type { RequestedControlActionRow } from '../index.js';

export const requestedControlActionsSyncDescriptor =
	createSyncDescriptor<RequestedControlActionRow>({
		id: 'requested_control_actions',
		table: 'requested_control_actions',
		endpointPath: '/sync/shapes/requested-control-actions',
		syncMode: 'on-demand',
		columns: [
			'id',
			'organizationId',
			'controlType',
			'recommendedMethodId',
			'summary',
			'habitatId',
			'inspectionId',
			'collectionId',
			'addressId',
			'requestedByProfileId',
			'requestedAt',
			'resolvedAt',
			'resolvedByProfileId',
			'createdByProfileId',
			'updatedByProfileId',
			'createdAt',
			'updatedAt',
		],
		getKey: (row) => row.id,
	});
