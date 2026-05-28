import { createSyncDescriptor } from '../descriptor-factory.js';
import type { UnitRow } from '../index.js';

export const unitsSyncDescriptor = createSyncDescriptor<UnitRow>({
	id: 'units',
	table: 'units',
	endpointPath: '/sync/shapes/units',
	syncMode: 'eager',
	columns: ['id', 'code', 'unitName', 'abbreviation', 'unitType', 'unitSystem', 'createdAt'],
	getKey: (row) => row.id,
});
