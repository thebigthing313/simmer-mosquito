import type { AuthInvitation } from '../auth-invitation.js';
import type { WorkOsAuthContext } from '../workos-auth-context.js';

export async function sendOrganizationInvitation(
	context: WorkOsAuthContext,
	input: {
		readonly email: string;
		readonly workosOrganizationId: string;
		readonly inviterWorkosUserId?: string;
	},
): Promise<AuthInvitation> {
	const invitation = await context.workos.userManagement.sendInvitation({
		email: input.email,
		organizationId: input.workosOrganizationId,
		...(input.inviterWorkosUserId === undefined
			? {}
			: { inviterUserId: input.inviterWorkosUserId }),
	});

	return {
		id: invitation.id,
		email: invitation.email,
		state: invitation.state,
		organizationId: invitation.organizationId,
		acceptedUserId: invitation.acceptedUserId,
		expiresAt: invitation.expiresAt,
		createdAt: invitation.createdAt,
		updatedAt: invitation.updatedAt,
	};
}
