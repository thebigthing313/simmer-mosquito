import { asSwitchRefusal } from '../as-switch-refusal.js';
import { openSealedSession } from '../sealed-session.js';
import type { SessionAuthenticationResult } from '../session-authentication.js';
import type { WorkOsAuthContext } from '../workos-auth-context.js';

/**
 * Re-seal a live session against another organization the user belongs to.
 * WorkOS models the move as a refresh carrying an organization, and its refusal
 * is the authorization: the SDK throws for a non-member rather than returning a
 * refusal, so that throw is read back as one.
 */
export async function switchOrganization(
	context: WorkOsAuthContext,
	input: {
		readonly sealedSession: string | undefined;
		readonly workosOrganizationId: string;
	},
): Promise<SessionAuthenticationResult> {
	const session = openSealedSession(context, input.sealedSession);
	if (session === null) {
		return { authenticated: false, reason: 'no_session_cookie_provided' };
	}

	try {
		return await session.refresh({
			organizationId: input.workosOrganizationId,
			fallbackReason: 'organization_switch_refused',
		});
	} catch (error) {
		const refusal = asSwitchRefusal(error);
		if (refusal === null) {
			throw error;
		}

		return refusal;
	}
}
