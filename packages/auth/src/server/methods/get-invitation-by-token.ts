import type { InvitationSummary } from '../auth-invitation.js';
import { classifyWorkOsFailure } from '../errors/classify-workos-failure.js';
import type { WorkOsAuthContext } from '../workos-auth-context.js';

export async function getInvitationByToken(
	context: WorkOsAuthContext,
	token: string,
): Promise<InvitationSummary | null> {
	try {
		const invitation = await context.workos.userManagement.findInvitationByToken(token);
		return {
			id: invitation.id,
			email: invitation.email,
			state: invitation.state,
			organizationId: invitation.organizationId,
		};
	} catch (error) {
		if (classifyWorkOsFailure(error).kind === 'not_found') {
			return null;
		}

		throw error;
	}
}
