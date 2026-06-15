import type { AuthenticatedSession } from '@simmer-mosquito/auth';
import type { AuthSessionProvider } from './auth-context.js';
import type { DevImpersonationConfig } from './env.js';

/**
 * DEV-ONLY auth bypass. When local development runs against a copy of the
 * production database (so WorkOS is not reachable / not desired), this provider
 * makes every request resolve as a fixed WorkOS user + organization. The real
 * `localIdentityResolver` still runs against the local DB, so the impersonated
 * request gets the true organization / profile / role for those ids.
 *
 * This is gated in {@link readServerEnv} so it can never activate when
 * `NODE_ENV=production`. Never wire this into a deployed environment.
 */
export function createDevSessionProvider(config: DevImpersonationConfig): AuthSessionProvider {
	const session: AuthenticatedSession = {
		authenticated: true,
		user: {
			workosUserId: config.workosUserId,
			email: config.email,
			firstName: null,
			lastName: null,
			displayName: config.displayName,
			emailVerified: true,
			profilePictureUrl: null,
		},
		workosOrganizationId: config.workosOrganizationId,
		sessionId: null,
		role: null,
	};

	return {
		// Ignores the cookie entirely: every request authenticates as the
		// impersonated identity.
		authenticateSession: async () => session,
	};
}
