import { createSyncDescriptor } from '../descriptor-factory.js';
import type { TrapRow } from '../index.js';

export const trapsSyncDescriptor = createSyncDescriptor<TrapRow>({
	id: 'traps',
	table: 'traps',
	endpointPath: '/sync/shapes/traps',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'lat',
		'lng',
		'geomType',
		'collectionMethodId',
		'addressId',
		'collectionLureId',
		'trapName',
		'trapCode',
		'description',
		'isActive',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
