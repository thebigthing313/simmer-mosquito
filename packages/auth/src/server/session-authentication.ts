import type { AuthUser } from '../client/auth-me.js';

export interface AuthenticatedSession {
	readonly authenticated: true;
	readonly user: AuthUser;
	readonly workosOrganizationId: string | null;
	readonly sessionId: string | null;
	readonly role: string | null;
	readonly sealedSession?: string;
}

export interface UnauthenticatedSession {
	readonly authenticated: false;
	readonly reason: string;
}

export type SessionAuthenticationResult = AuthenticatedSession | UnauthenticatedSession;

/**
 * Whether the caller may spend the single-use refresh token when the access
 * token has expired. Only `/auth/me` sets `mayRefresh`; every other route
 * answers {@link SESSION_REFRESH_REQUIRED} and the client retries through it.
 */
export interface SessionAuthenticationOptions {
	readonly mayRefresh: boolean;
}

/** The refusal a route answers when it did not attempt a refresh. */
export const SESSION_REFRESH_REQUIRED = 'session_refresh_required';
