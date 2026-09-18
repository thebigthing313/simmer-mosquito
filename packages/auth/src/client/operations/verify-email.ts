import { authenticatedOutcome } from '../authenticated-outcome.js';
import type { AuthJsonPost } from '../create-auth-json-post.js';
import { organizationSelectionOutcome } from '../organization-selection-outcome.js';
import type { VerifyEmailOutcome } from '../outcomes.js';
import { readReason } from '../read-reason.js';

export async function verifyEmail(
	post: AuthJsonPost,
	input: { readonly code: string; readonly pendingAuthenticationToken: string },
): Promise<VerifyEmailOutcome> {
	const { data } = await post('/auth/verify-email', input);
	if (data.ok === true) {
		return authenticatedOutcome(data);
	}

	if (data.status === 'organization_selection_required') {
		return organizationSelectionOutcome(data);
	}

	if (data.status === 'invalid_code') {
		return { status: 'invalid_code' };
	}

	return { status: 'error', reason: readReason(data, 'Unable to verify the code.') };
}
