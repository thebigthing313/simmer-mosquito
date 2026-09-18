import type { SessionAuthenticationResult } from './session-authentication.js';
import { toSessionResult } from './to-session-result.js';
import type { WorkOsAuthContext } from './workos-auth-context.js';

/**
 * A sealed session cookie, unsealed. Every operation answers in
 * {@link SessionAuthenticationResult} terms, so the four methods over a session
 * share one reading of the SDK's results.
 */
export interface SealedSession {
	/** Verify the access token without spending the refresh token. */
	readonly authenticate: () => Promise<SessionAuthenticationResult>;
	/**
	 * Spend the single-use refresh token, re-sealing against `organizationId`
	 * when given. A refusal with no reason of its own reads `fallbackReason`.
	 */
	readonly refresh: (options: {
		readonly organizationId?: string;
		readonly fallbackReason: string;
	}) => Promise<SessionAuthenticationResult>;
	readonly logoutUrl: () => Promise<string>;
	/** Best effort: an expired or invalid session is already revoked for this purpose. */
	readonly revoke: () => Promise<void>;
}

/** `null` for a missing or blank cookie, which every caller answers before WorkOS. */
export function openSealedSession(
	context: WorkOsAuthContext,
	sealedSession: string | undefined,
): SealedSession | null {
	if (sealedSession === undefined || sealedSession.trim() === '') {
		return null;
	}

	const session = context.workos.userManagement.loadSealedSession({
		sessionData: sealedSession,
		cookiePassword: context.config.cookiePassword,
	});

	return {
		authenticate: async () => toSessionResult(await session.authenticate(), 'unauthenticated'),
		refresh: async ({ organizationId, fallbackReason }) =>
			toSessionResult(
				await session.refresh(organizationId === undefined ? undefined : { organizationId }),
				fallbackReason,
			),
		logoutUrl: () => session.getLogoutUrl(),
		revoke: async () => {
			try {
				const authenticated = await session.authenticate();
				if (authenticated.authenticated && authenticated.sessionId) {
					await context.workos.userManagement.revokeSession({
						sessionId: authenticated.sessionId,
					});
				}
			} catch {
				return;
			}
		},
	};
}
