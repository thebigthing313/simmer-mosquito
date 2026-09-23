import { authenticatedOutcome } from '../authenticated-outcome.js';
import type { AuthJsonPost } from '../create-auth-json-post.js';
import { organizationSelectionOutcome } from '../organization-selection-outcome.js';
import type { SignUpOutcome } from '../outcomes.js';
import { readAuthOutcome } from '../read-auth-outcome.js';
import { verificationOutcome } from '../verification-outcome.js';
import { weakPasswordOutcome } from '../weak-password-outcome.js';
import type { SignUpBody } from '../wire.js';

export async function signUp(
	post: AuthJsonPost,
	input: {
		readonly email: string;
		readonly password: string;
		readonly firstName?: string;
		readonly lastName?: string;
	},
): Promise<SignUpOutcome> {
	return readAuthOutcome<SignUpBody, SignUpOutcome>(await post('/auth/sign-up', input), {
		ok: authenticatedOutcome,
		refused: {
			verification_required: verificationOutcome,
			organization_selection_required: organizationSelectionOutcome,
			email_taken: () => ({ status: 'email_taken' }),
			weak_password: weakPasswordOutcome,
			invalid_credentials: () => ({ status: 'error', reason: 'Unable to create your account.' }),
		},
		fallback: 'Unable to create your account.',
	});
}
