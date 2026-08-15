import { createSyncDescriptor } from '../descriptor-factory.js';
import type { ProfileRow } from '../index.js';

export const profilesSyncDescriptor = createSyncDescriptor<ProfileRow>({
	id: 'profiles',
	table: 'profiles',
	endpointPath: '/sync/shapes/profiles',
	columns: [
		'id',
		'organizationId',
		'userId',
		'displayName',
		'email',
		'isActive',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
