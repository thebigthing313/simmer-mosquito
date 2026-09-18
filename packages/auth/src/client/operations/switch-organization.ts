import type { AuthJsonPost } from '../create-auth-json-post.js';
import type { SwitchOrganizationOutcome } from '../outcomes.js';
import { readReason } from '../read-reason.js';

/**
 * Move a signed-in session into another organization the user belongs to
 * (ADR 0011). Unlike `selectOrganization`, nothing is pending.
 */
export async function switchOrganization(
	post: AuthJsonPost,
	input: { readonly organizationId: string },
): Promise<SwitchOrganizationOutcome> {
	const { data } = await post('/auth/switch-organization', input);
	if (data.ok === true) {
		return { status: 'switched' };
	}

	if (data.status === 'organization_switch_refused') {
		return { status: 'refused', reason: readReason(data, 'That organization is not available.') };
	}

	return { status: 'error', reason: readReason(data, 'Unable to switch organization.') };
}
