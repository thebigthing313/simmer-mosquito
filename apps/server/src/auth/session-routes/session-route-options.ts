import type { WorkOsSessionAuth } from '@simmer-mosquito/auth';
import type { AuthSessionProvider } from '../context/auth-session-provider.js';
import type { LocalAuthIdentityResolver } from '../context/local-auth-identity-resolver.js';
import type { SetAuthCookie } from '../middleware/set-auth-cookie.js';
import type { FinalizeWorkOsSession } from '../user-routes/auth-user-flows.js';

/** What the redirect routes need of the WorkOS client. */
export type SessionAuth = Pick<
	WorkOsSessionAuth,
	'getAuthorizationUrl' | 'authenticateCode' | 'revokeSession'
>;

export interface SessionRouteOptions {
	readonly auth: SessionAuth;
	/** The per-request session check; dev impersonation swaps it while the redirect routes keep WorkOS. */
	readonly sessionProvider: AuthSessionProvider;
	readonly localIdentityResolver: LocalAuthIdentityResolver;
	readonly nodeEnv: 'development' | 'production' | 'test';
	readonly appOrigin: string;
	/** Where a `returnTo` may point. Anything else is dropped, not followed. */
	readonly appOrigins: readonly string[];
	readonly setAuthCookie: SetAuthCookie;
	readonly finalizeSession: FinalizeWorkOsSession;
}
