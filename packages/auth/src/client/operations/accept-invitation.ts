import { authenticatedOutcome } from '../authenticated-outcome.js';
import type { AuthJsonPost } from '../create-auth-json-post.js';
import { organizationSelectionOutcome } from '../organization-selection-outcome.js';
import type { AcceptInvitationOutcome } from '../outcomes.js';
import { readReason } from '../read-reason.js';
import { verificationOutcome } from '../verification-outcome.js';

export async function acceptInvitation(
	post: AuthJsonPost,
	input: {
		readonly invitationToken: string;
		readonly password: string;
		readonly firstName?: string;
		readonly lastName?: string;
	},
): Promise<AcceptInvitationOutcome> {
	const { data } = await post('/auth/accept-invitation', input);
	if (data.ok === true) {
		return authenticatedOutcome(data);
	}

	if (data.status === 'verification_required') {
		return verificationOutcome(data);
	}

	if (data.status === 'organization_selection_required') {
		return organizationSelectionOutcome(data);
	}

	if (data.status === 'account_exists') {
		return { status: 'account_exists' };
	}

	if (data.status === 'invalid_invitation') {
		return { status: 'invalid_invitation' };
	}

	if (data.status === 'weak_password') {
		return { status: 'weak_password', reason: readReason(data, 'Choose a stronger password.') };
	}

	return { status: 'error', reason: readReason(data, 'Unable to accept the invitation.') };
}
