import { authenticatedOutcome } from '../authenticated-outcome.js';
import type { AuthJsonPost } from '../create-auth-json-post.js';
import { organizationSelectionOutcome } from '../organization-selection-outcome.js';
import type { VerifyEmailOutcome } from '../outcomes.js';
import { readAuthOutcome } from '../read-auth-outcome.js';
import type { VerifyEmailBody } from '../wire.js';

export async function verifyEmail(
	post: AuthJsonPost,
	input: { readonly code: string; readonly pendingAuthenticationToken: string },
): Promise<VerifyEmailOutcome> {
	return readAuthOutcome<VerifyEmailBody, VerifyEmailOutcome>(
		await post('/auth/verify-email', input),
		{
			ok: authenticatedOutcome,
			refused: {
				organization_selection_required: organizationSelectionOutcome,
				invalid_code: () => ({ status: 'invalid_code' }),
			},
			fallback: 'Unable to verify the code.',
		},
	);
}
