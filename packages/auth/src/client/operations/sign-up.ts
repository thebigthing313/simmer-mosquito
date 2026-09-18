import { authenticatedOutcome } from '../authenticated-outcome.js';
import type { AuthJsonPost } from '../create-auth-json-post.js';
import { organizationSelectionOutcome } from '../organization-selection-outcome.js';
import type { SignUpOutcome } from '../outcomes.js';
import { readReason } from '../read-reason.js';
import { verificationOutcome } from '../verification-outcome.js';

export async function signUp(
	post: AuthJsonPost,
	input: {
		readonly email: string;
		readonly password: string;
		readonly firstName?: string;
		readonly lastName?: string;
	},
): Promise<SignUpOutcome> {
	const { data } = await post('/auth/sign-up', input);
	if (data.ok === true) {
		return authenticatedOutcome(data);
	}

	if (data.status === 'verification_required') {
		return verificationOutcome(data);
	}

	if (data.status === 'organization_selection_required') {
		return organizationSelectionOutcome(data);
	}

	if (data.status === 'email_taken') {
		return { status: 'email_taken' };
	}

	if (data.status === 'weak_password') {
		return { status: 'weak_password', reason: readReason(data, 'Choose a stronger password.') };
	}

	return { status: 'error', reason: readReason(data, 'Unable to create your account.') };
}
