import { classifyWorkOsFailure } from '../errors/classify-workos-failure.js';
import type { WorkOsAuthContext } from '../workos-auth-context.js';

/**
 * Kill an invitation link. `identity.reinvite` calls this before sending,
 * because WorkOS holds one pending invitation per address per organization
 * (#218). WorkOS answers 404 for an unknown invitation and 400 for one already
 * accepted, expired or revoked; both are `already_settled`, so a retried
 * re-invitation succeeds.
 */
export async function revokeInvitation(
	context: WorkOsAuthContext,
	invitationId: string,
): Promise<{ readonly status: 'revoked' | 'already_settled' }> {
	try {
		await context.workos.userManagement.revokeInvitation(invitationId);
		return { status: 'revoked' };
	} catch (error) {
		switch (classifyWorkOsFailure(error).kind) {
			case 'not_found':
			case 'bad_request':
				return { status: 'already_settled' };
			default:
				throw error;
		}
	}
}
