import { openSealedSession } from '../sealed-session.js';
import {
	SESSION_REFRESH_REQUIRED,
	type SessionAuthenticationOptions,
	type SessionAuthenticationResult,
} from '../session-authentication.js';
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
	const session = openSealedSession(context, sealedSession);
	if (session === null) {
		return { authenticated: false, reason: 'no_session_cookie_provided' };
	}

	const verified = await session.authenticate();
	if (verified.authenticated) {
		return verified;
	}

	if (!options.mayRefresh) {
		return { authenticated: false, reason: SESSION_REFRESH_REQUIRED };
	}

	return session.refresh({ fallbackReason: verified.reason });
}
