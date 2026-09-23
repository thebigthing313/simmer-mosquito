import type { WorkOsAuthContext } from '../workos-auth-context.js';

/**
 * The WorkOS membership this email holds in the organization, asked before an
 * invitation is sent because `sendInvitation` throws for an existing member.
 * Two calls, since WorkOS lists memberships by user id and an invitation names
 * an email.
 */
export async function findOrganizationMember(
	context: WorkOsAuthContext,
	input: { readonly email: string; readonly workosOrganizationId: string },
): Promise<{
	readonly workosUserId: string;
	readonly status: 'active' | 'inactive' | 'pending';
} | null> {
	const users = await context.workos.userManagement.listUsers({ email: input.email, limit: 1 });
	const user = users.data[0];
	if (user === undefined) {
		return null;
	}

	const memberships = await context.workos.userManagement.listOrganizationMemberships({
		userId: user.id,
		organizationId: input.workosOrganizationId,
		limit: 1,
	});

	const membership = memberships.data[0];
	if (membership === undefined) {
		return null;
	}

	return { workosUserId: user.id, status: membership.status };
}
