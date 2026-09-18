export interface AuthUser {
	readonly workosUserId: string;
	readonly email: string;
	readonly firstName: string | null;
	readonly lastName: string | null;
	readonly displayName: string;
	readonly emailVerified: boolean | null;
	readonly profilePictureUrl: string | null;
}

export interface LocalIdentity {
	readonly userId: string;
	readonly organizationId: string | null;
	readonly organizationName?: string;
	readonly organizationSlug?: string | null;
	readonly profileId: string | null;
	readonly membershipId: string | null;
	readonly role: string | null;
}

export interface AuthenticatedMe {
	readonly authenticated: true;
	readonly user: AuthUser;
	readonly workosOrganizationId: string | null;
	readonly localIdentity: LocalIdentity;
}

/**
 * Why the server would not answer with a session. `AuthContextError` in
 * `apps/server/src/auth-context.ts` produces it and {@link RefusedMeBody} holds
 * it to this list.
 */
export type ServerAuthRefusal = 'unauthenticated' | 'organization_required' | 'membership_required';

/**
 * A refusal as a client holds it. `unavailable` is the client's own: the round
 * trip broke, so there is no server answer to carry.
 */
export type AuthRefusal = ServerAuthRefusal | 'unavailable';

/**
 * The refusal body every guarded route answers with. `error` is the code a
 * caller branches on, `reason` a sentence it may render, and `detail` the
 * session layer's machine string, present only for a log.
 */
export interface RefusedMeBody {
	readonly authenticated: false;
	readonly error: ServerAuthRefusal;
	readonly reason: string;
	readonly detail?: string;
}

export interface UnauthenticatedMe {
	readonly authenticated: false;
	readonly error: AuthRefusal;
	readonly reason: string;
}

export type AuthMe = AuthenticatedMe | UnauthenticatedMe;
