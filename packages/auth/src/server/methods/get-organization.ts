import type { AuthOrganization } from '../auth-organization.js';
import type { WorkOsAuthContext } from '../workos-auth-context.js';

export async function getOrganization(
	context: WorkOsAuthContext,
	workosOrganizationId: string | null,
): Promise<AuthOrganization | null> {
	if (workosOrganizationId === null) {
		return null;
	}

	const organization = await context.workos.organizations.getOrganization(workosOrganizationId);

	return { workosOrganizationId: organization.id, name: organization.name };
}
