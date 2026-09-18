import { authenticatedOutcome } from '../authenticated-outcome.js';
import type { AuthJsonPost } from '../create-auth-json-post.js';
import { organizationSelectionOutcome } from '../organization-selection-outcome.js';
import type { SignInOutcome } from '../outcomes.js';
import { readReason } from '../read-reason.js';
import { verificationOutcome } from '../verification-outcome.js';

export async function signIn(
	post: AuthJsonPost,
	input: { readonly email: string; readonly password: string },
): Promise<SignInOutcome> {
	const { data } = await post('/auth/sign-in', input);
	if (data.ok === true) {
		return authenticatedOutcome(data);
	}

	if (data.status === 'verification_required') {
		return verificationOutcome(data);
	}

	if (data.status === 'organization_selection_required') {
		return organizationSelectionOutcome(data);
	}

	if (data.status === 'invalid_credentials') {
		return { status: 'invalid_credentials' };
	}

	return { status: 'error', reason: readReason(data, 'Unable to sign in.') };
}
