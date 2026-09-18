import type { WorkOS } from '@workos-inc/node';

import type {
	AuthenticatedSession,
	SessionAuthenticationResult,
} from './session-authentication.js';
import { toAuthUser } from './to-auth-user.js';

export type SealedSessionRefreshResult = Awaited<
	ReturnType<ReturnType<WorkOS['userManagement']['loadSealedSession']>['refresh']>
>;

/** A completed refresh as a session. The caller must re-set the sealed cookie. */
export function toSwitchedSession(
	refreshResult: SealedSessionRefreshResult,
): SessionAuthenticationResult {
	if (!refreshResult.authenticated) {
		return {
			authenticated: false,
			reason: refreshResult.reason ?? 'organization_switch_refused',
		};
	}

	const switched: AuthenticatedSession = {
		authenticated: true,
		user: toAuthUser(refreshResult.user),
		workosOrganizationId: refreshResult.organizationId ?? null,
		sessionId: refreshResult.sessionId,
		role: refreshResult.role ?? null,
	};

	return refreshResult.sealedSession === undefined
		? switched
		: { ...switched, sealedSession: refreshResult.sealedSession };
}
