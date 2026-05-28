import { createSyncDescriptor } from '../descriptor-factory.js';
import type { RouteRow } from '../index.js';

export const routesSyncDescriptor = createSyncDescriptor<RouteRow>({
	id: 'routes',
	table: 'routes',
	endpointPath: '/sync/shapes/routes',
	syncMode: 'eager',
	columns: ['id', 'organizationId', 'routeName', 'routeType', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
});
