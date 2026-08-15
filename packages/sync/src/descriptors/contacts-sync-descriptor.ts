import { createSyncDescriptor } from '../descriptor-factory.js';
import type { ContactRow } from '../index.js';

export const contactsSyncDescriptor = createSyncDescriptor<ContactRow>({
	id: 'contacts',
	table: 'contacts',
	endpointPath: '/sync/shapes/contacts',
	columns: [
		'id',
		'organizationId',
		'contactName',
		'preferredPhone',
		'alternatePhone',
		'email',
		'company',
		'department',
		'title',
		'wantsEmail',
		'wantsSms',
		'wantsPhone',
		'metadata',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
