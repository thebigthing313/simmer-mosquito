import { isSettledInvitationRefusal } from '../errors/is-settled-invitation-refusal.js';
import type { WorkOsAuthContext } from '../workos-auth-context.js';

/**
 * Kill an invitation link. `identity.reinvite` calls this before sending,
 * because WorkOS holds one pending invitation per address per organization
 * (#218). An already settled invitation answers `already_settled` rather than
 * throwing, so a retried re-invitation succeeds.
 */
export async function revokeInvitation(
	context: WorkOsAuthContext,
	invitationId: string,
): Promise<{ readonly status: 'revoked' | 'already_settled' }> {
	try {
		await context.workos.userManagement.revokeInvitation(invitationId);
		return { status: 'revoked' };
	} catch (error) {
		if (isSettledInvitationRefusal(error)) {
			return { status: 'already_settled' };
		}
		throw error;
	}
}
