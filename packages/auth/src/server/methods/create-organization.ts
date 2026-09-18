import type { AuthOrganization } from '../auth-organization.js';
import type { WorkOsAuthContext } from '../workos-auth-context.js';

export async function createOrganization(
	context: WorkOsAuthContext,
	input: { readonly name: string },
): Promise<AuthOrganization> {
	const organization = await context.workos.organizations.createOrganization({
		name: input.name,
		metadata: { source: 'simmer-operator' },
	});

	return { workosOrganizationId: organization.id, name: organization.name };
}
