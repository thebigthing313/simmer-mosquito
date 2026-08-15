import { createSyncDescriptor } from '../descriptor-factory.js';
import type { CommentRow } from '../index.js';

export const commentsSyncDescriptor = createSyncDescriptor<CommentRow>({
	id: 'comments',
	table: 'comments',
	endpointPath: '/sync/shapes/comments',
	columns: [
		'id',
		'organizationId',
		'entityType',
		'entityId',
		'commentText',
		'commentedByProfileId',
		'commentedAt',
		'isPinned',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
