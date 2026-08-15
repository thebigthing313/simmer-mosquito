import { createSyncDescriptor } from '../descriptor-factory.js';
import type { MembershipRow } from '../index.js';

export const membershipsSyncDescriptor = createSyncDescriptor<MembershipRow>({
	id: 'memberships',
	table: 'memberships',
	endpointPath: '/sync/shapes/memberships',
	columns: [
		'id',
		'organizationId',
		'userId',
		'profileId',
		'role',
		'status',
		'isDefault',
		'invitedEmail',
		'workosInvitationId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
