import { authenticatedOutcome } from '../authenticated-outcome.js';
import type { AuthJsonPost } from '../create-auth-json-post.js';
import type { SelectOrganizationOutcome } from '../outcomes.js';
import { readReason } from '../read-reason.js';

/** Resolve a sign-in that is still pending an organization choice. */
export async function selectOrganization(
	post: AuthJsonPost,
	input: { readonly organizationId: string; readonly pendingAuthenticationToken: string },
): Promise<SelectOrganizationOutcome> {
	const { data } = await post('/auth/select-organization', input);
	if (data.ok === true) {
		return authenticatedOutcome(data);
	}

	if (data.status === 'invalid_selection') {
		return { status: 'invalid_selection' };
	}

	return { status: 'error', reason: readReason(data, 'Unable to select organization.') };
}
