import { authenticatedOutcome } from '../authenticated-outcome.js';
import type { AuthJsonPost } from '../create-auth-json-post.js';
import { organizationSelectionOutcome } from '../organization-selection-outcome.js';
import type { SignInOutcome } from '../outcomes.js';
import { readAuthOutcome } from '../read-auth-outcome.js';
import { verificationOutcome } from '../verification-outcome.js';
import type { SignInBody } from '../wire.js';

export async function signIn(
	post: AuthJsonPost,
	input: { readonly email: string; readonly password: string },
): Promise<SignInOutcome> {
	return readAuthOutcome<SignInBody, SignInOutcome>(await post('/auth/sign-in', input), {
		ok: authenticatedOutcome,
		refused: {
			verification_required: verificationOutcome,
			organization_selection_required: organizationSelectionOutcome,
			invalid_credentials: () => ({ status: 'invalid_credentials' }),
		},
		fallback: 'Unable to sign in.',
	});
}
