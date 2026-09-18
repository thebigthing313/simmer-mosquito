import type { AuthenticatedSession } from './session-authentication.js';
import { toAuthUser } from './to-auth-user.js';
import type { WorkOsAuthenticationResponseLike } from './workos-user-like.js';

export function toAuthenticatedSession(
	response: WorkOsAuthenticationResponseLike,
): AuthenticatedSession {
	if (response.sealedSession === undefined) {
		throw new Error('WorkOS did not return a sealed session.');
	}

	return {
		authenticated: true,
		user: toAuthUser(response.user),
		workosOrganizationId: response.organizationId ?? null,
		sessionId: null,
		role: null,
		sealedSession: response.sealedSession,
	};
}
