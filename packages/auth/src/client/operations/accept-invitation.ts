import { authenticatedOutcome } from '../authenticated-outcome.js';
import type { AuthJsonPost } from '../create-auth-json-post.js';
import { organizationSelectionOutcome } from '../organization-selection-outcome.js';
import type { AcceptInvitationOutcome } from '../outcomes.js';
import { readAuthOutcome } from '../read-auth-outcome.js';
import { verificationOutcome } from '../verification-outcome.js';
import { weakPasswordOutcome } from '../weak-password-outcome.js';
import type { AcceptInvitationBody } from '../wire.js';

export async function acceptInvitation(
	post: AuthJsonPost,
	input: {
		readonly invitationToken: string;
		readonly password: string;
		readonly firstName?: string;
		readonly lastName?: string;
	},
): Promise<AcceptInvitationOutcome> {
	return readAuthOutcome<AcceptInvitationBody, AcceptInvitationOutcome>(
		await post('/auth/accept-invitation', input),
		{
			ok: authenticatedOutcome,
			refused: {
				verification_required: verificationOutcome,
				organization_selection_required: organizationSelectionOutcome,
				account_exists: () => ({ status: 'account_exists' }),
				invalid_invitation: () => ({ status: 'invalid_invitation' }),
				weak_password: weakPasswordOutcome,
				invalid_credentials: () => ({
					status: 'error',
					reason: 'Unable to accept the invitation.',
				}),
			},
			fallback: 'Unable to accept the invitation.',
		},
	);
}
