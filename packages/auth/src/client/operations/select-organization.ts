import { authenticatedOutcome } from '../authenticated-outcome.js';
import type { AuthJsonPost } from '../create-auth-json-post.js';
import type { SelectOrganizationOutcome } from '../outcomes.js';
import { readAuthOutcome } from '../read-auth-outcome.js';
import type { SelectOrganizationBody } from '../wire.js';

/** Resolve a sign-in that is still pending an organization choice. */
export async function selectOrganization(
	post: AuthJsonPost,
	input: { readonly organizationId: string; readonly pendingAuthenticationToken: string },
): Promise<SelectOrganizationOutcome> {
	return readAuthOutcome<SelectOrganizationBody, SelectOrganizationOutcome>(
		await post('/auth/select-organization', input),
		{
			ok: authenticatedOutcome,
			refused: { invalid_selection: () => ({ status: 'invalid_selection' }) },
			fallback: 'Unable to select organization.',
		},
	);
}
