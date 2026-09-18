import type {
	SessionAuthenticationOptions,
	SessionAuthenticationResult,
	WorkOsSessionAuth,
} from '@simmer-mosquito/auth';

/**
 * The per-request session check as a seam. Its own interface rather than a
 * `Pick` off the WorkOS client, because `dev-impersonation.ts` implements it
 * without being a WorkOS client; the assertion below keeps the two in step.
 */
export interface AuthSessionProvider {
	authenticateSession(
		sealedSession: string | undefined,
		options: SessionAuthenticationOptions,
	): Promise<SessionAuthenticationResult>;
}

/**
 * Errors with the method name when the WorkOS client stops fitting the seam.
 * The same three lines as the generated drift suite in `packages/sync`, since
 * the idiom has no runtime to share (#716).
 */
type Assert<T extends never> = T;
type _WorkOsSessionAuthIsASessionProvider = Assert<
	WorkOsSessionAuth extends AuthSessionProvider ? never : 'authenticateSession'
>;
