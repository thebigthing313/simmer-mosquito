import { createSyncDescriptor } from '../descriptor-factory.js';
import type { GenusRow } from '../index.js';

export const generaSyncDescriptor = createSyncDescriptor<GenusRow>({
	id: 'genera',
	table: 'genera',
	endpointPath: '/sync/shapes/genera',
	syncMode: 'eager',
	columns: ['id', 'abbreviation', 'name', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
});
