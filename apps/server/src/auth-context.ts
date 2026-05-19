import type { AuthUser, SessionAuthenticationResult } from '@simmer-mosquito/auth';
import type { ActiveLocalAuthIdentity, SimmerRole } from '@simmer-mosquito/db';

export interface AuthContext {
	readonly workosUser: AuthUser;
	readonly workosOrganizationId: string;
	readonly workosSessionId: string | null;
	readonly workosRole: string | null;
	readonly user: ActiveLocalAuthIdentity['user'];
	readonly organization: ActiveLocalAuthIdentity['organization'];
	readonly profile: ActiveLocalAuthIdentity['profile'];
	readonly membership: ActiveLocalAuthIdentity['membership'];
	readonly role: SimmerRole;
}

export type AuthContextError =
	| {
			readonly type: 'unauthenticated';
			readonly reason: string;
	  }
	| {
			readonly type: 'organization_required';
			readonly reason: string;
	  }
	| {
			readonly type: 'membership_required';
			readonly reason: string;
			readonly workosOrganizationId: string;
	  };

export type AuthContextResult =
	| {
			readonly ok: true;
			readonly context: AuthContext;
			readonly sealedSession?: string;
	  }
	| {
			readonly ok: false;
			readonly status: 401 | 403;
			readonly error: AuthContextError;
			readonly sealedSession?: string;
	  };

export interface AuthSessionProvider {
	authenticateSession(sealedSession: string | undefined): Promise<SessionAuthenticationResult>;
}

export interface LocalAuthIdentityResolver {
	resolveActiveLocalAuthIdentity(input: {
		readonly workosUserId: string;
		readonly workosOrganizationId: string;
	}): Promise<ActiveLocalAuthIdentity | null>;
}

export async function resolveAuthContext(options: {
	readonly sealedSession: string | undefined;
	readonly auth: AuthSessionProvider;
	readonly localIdentityResolver: LocalAuthIdentityResolver;
}): Promise<AuthContextResult> {
	const session = await options.auth.authenticateSession(options.sealedSession);

	if (!session.authenticated) {
		return {
			ok: false,
			status: 401,
			error: {
				type: 'unauthenticated',
				reason: session.reason,
			},
		};
	}

	if (session.workosOrganizationId === null) {
		return {
			ok: false,
			status: 403,
			error: {
				type: 'organization_required',
				reason: 'WorkOS session has no selected organization.',
			},
			...(session.sealedSession === undefined ? {} : { sealedSession: session.sealedSession }),
		};
	}

	const localIdentity = await options.localIdentityResolver.resolveActiveLocalAuthIdentity({
		workosUserId: session.user.workosUserId,
		workosOrganizationId: session.workosOrganizationId,
	});

	if (localIdentity === null) {
		return {
			ok: false,
			status: 403,
			error: {
				type: 'membership_required',
				reason: 'No active SIMMER membership/profile exists for selected organization.',
				workosOrganizationId: session.workosOrganizationId,
			},
			...(session.sealedSession === undefined ? {} : { sealedSession: session.sealedSession }),
		};
	}

	return {
		ok: true,
		context: {
			workosUser: session.user,
			workosOrganizationId: session.workosOrganizationId,
			workosSessionId: session.sessionId,
			workosRole: session.role,
			user: localIdentity.user,
			organization: localIdentity.organization,
			profile: localIdentity.profile,
			membership: localIdentity.membership,
			role: localIdentity.membership.role,
		},
		...(session.sealedSession === undefined ? {} : { sealedSession: session.sealedSession }),
	};
}

export function toAuthFailureBody(result: Extract<AuthContextResult, { ok: false }>) {
	return {
		authenticated: false,
		error: result.error.type,
		reason: result.error.type === 'unauthenticated' ? result.error.reason : result.error.type,
	};
}

export function toAuthMeBody(authContext: AuthContext) {
	return {
		authenticated: true,
		user: authContext.workosUser,
		workosOrganizationId: authContext.workosOrganizationId,
		localIdentity: {
			userId: authContext.user.id,
			organizationId: authContext.organization.id,
			organizationName: authContext.organization.name,
			organizationSlug: authContext.organization.slug,
			profileId: authContext.profile.id,
			membershipId: authContext.membership.id,
			role: authContext.role,
		},
	};
}

export function toPublicAuthContext(authContext: AuthContext) {
	return {
		workos: {
			user: authContext.workosUser,
			organizationId: authContext.workosOrganizationId,
			role: authContext.workosRole,
		},
		simmer: {
			user: authContext.user,
			organization: authContext.organization,
			profile: authContext.profile,
			membership: authContext.membership,
			role: authContext.role,
		},
	};
}
