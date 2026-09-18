import type { WorkOsAuthContext } from '../workos-auth-context.js';

/**
 * End a user's WorkOS membership in an organization, which is the half of
 * ending a SIMMER membership that revokes access. Deactivated rather than
 * deleted, to mirror the SIMMER row. `not_a_member` is not a failure: the two
 * systems can already disagree, and this is how they are brought back together.
 */
export async function deactivateOrganizationMembership(
	context: WorkOsAuthContext,
	input: { readonly workosUserId: string; readonly workosOrganizationId: string },
): Promise<{ readonly status: 'deactivated' | 'not_a_member' }> {
	const memberships = await context.workos.userManagement.listOrganizationMemberships({
		userId: input.workosUserId,
		organizationId: input.workosOrganizationId,
		limit: 1,
	});

	const membership = memberships.data[0];
	if (membership === undefined) {
		return { status: 'not_a_member' };
	}

	await context.workos.userManagement.deactivateOrganizationMembership(membership.id);
	return { status: 'deactivated' };
}
