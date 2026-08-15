import { createSyncDescriptor } from '../descriptor-factory.js';
import type { InsecticideRow } from '../index.js';

export const insecticidesSyncDescriptor = createSyncDescriptor<InsecticideRow>({
	id: 'insecticides',
	table: 'insecticides',
	endpointPath: '/sync/shapes/insecticides',
	columns: [
		'id',
		'organizationId',
		'tradeName',
		'activeIngredient',
		'isActive',
		'type',
		'registrationNumber',
		'defaultUnitId',
		'labelUrl',
		'msdsUrl',
		'shorthand',
		'metadata',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
