import type { AuthJsonPost } from '../create-auth-json-post.js';
import type { SwitchOrganizationOutcome } from '../outcomes.js';
import { readAuthOutcome } from '../read-auth-outcome.js';
import { readReason } from '../read-reason.js';
import type { SwitchOrganizationBody } from '../wire.js';

/**
 * Move a signed-in session into another organization the user belongs to
 * (ADR 0011). Unlike `selectOrganization`, nothing is pending.
 */
export async function switchOrganization(
	post: AuthJsonPost,
	input: { readonly organizationId: string },
): Promise<SwitchOrganizationOutcome> {
	return readAuthOutcome<SwitchOrganizationBody, SwitchOrganizationOutcome>(
		await post('/auth/switch-organization', input),
		{
			ok: () => ({ status: 'switched' }),
			refused: {
				organization_switch_refused: (body) => ({
					status: 'refused',
					reason: readReason(body, 'That organization is not available.'),
				}),
			},
			fallback: 'Unable to switch organization.',
		},
	);
}
