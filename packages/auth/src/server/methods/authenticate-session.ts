import { isBlankSession } from '../is-blank-session.js';
import { loadSealedSession } from '../load-sealed-session.js';
import {
	type AuthenticatedSession,
	SESSION_REFRESH_REQUIRED,
	type SessionAuthenticationOptions,
	type SessionAuthenticationResult,
} from '../session-authentication.js';
import { toAuthUser } from '../to-auth-user.js';
import type { WorkOsAuthContext } from '../workos-auth-context.js';

/**
 * Verify a sealed session, refreshing it only when `mayRefresh` allows. The
 * refresh token is single use, so every route but `/auth/me` answers
 * {@link SESSION_REFRESH_REQUIRED} instead.
 */
export async function authenticateSession(
	context: WorkOsAuthContext,
	sealedSession: string | undefined,
	options: SessionAuthenticationOptions,
): Promise<SessionAuthenticationResult> {
	if (isBlankSession(sealedSession)) {
		return { authenticated: false, reason: 'no_session_cookie_provided' };
	}

	const session = loadSealedSession(context, sealedSession);

	const authResult = await session.authenticate();
	if (authResult.authenticated) {
		return {
			authenticated: true,
			user: toAuthUser(authResult.user),
			workosOrganizationId: authResult.organizationId ?? null,
			sessionId: authResult.sessionId,
			role: authResult.role ?? null,
		};
	}

	if (!options.mayRefresh) {
		return { authenticated: false, reason: SESSION_REFRESH_REQUIRED };
	}

	const refreshResult = await session.refresh();
	if (refreshResult.authenticated) {
		const refreshedSession: AuthenticatedSession = {
			authenticated: true,
			user: toAuthUser(refreshResult.user),
			workosOrganizationId: refreshResult.organizationId ?? null,
			sessionId: refreshResult.sessionId,
			role: refreshResult.role ?? null,
		};

		if (refreshResult.sealedSession !== undefined) {
			return { ...refreshedSession, sealedSession: refreshResult.sealedSession };
		}

		return refreshedSession;
	}

	return {
		authenticated: false,
		reason: refreshResult.reason ?? authResult.reason ?? 'unauthenticated',
	};
}
