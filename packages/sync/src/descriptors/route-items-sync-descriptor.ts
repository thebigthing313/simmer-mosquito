import { createSyncDescriptor } from '../descriptor-factory.js';
import type { RouteItemRow } from '../index.js';

export const routeItemsSyncDescriptor = createSyncDescriptor<RouteItemRow>({
	id: 'route_items',
	table: 'route_items',
	endpointPath: '/sync/shapes/route-items',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'routeId',
		'entityType',
		'entityId',
		'position',
		'directionsToNextItem',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
