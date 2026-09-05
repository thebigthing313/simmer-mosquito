import type {
	AuthUser,
	SessionAuthenticationOptions,
	SessionAuthenticationResult,
} from '@simmer-mosquito/auth';
import type { ActiveLocalAuthIdentity, SimmerRole } from '@simmer-mosquito/db';
import { resolveOrganizationSettings } from '@simmer-mosquito/domain';

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
	/**
	 * The organization's IANA timezone — the authority for which calendar day a
	 * timestamped record belongs to.
	 *
	 * On the context rather than fetched per read because *every* date-bounded
	 * read needs it and the map-tile path cannot afford a second query for it.
	 * Resolved through the domain, so a missing or unparseable setting lands on
	 * `DEFAULT_ORGANIZATION_TIMEZONE` rather than on the database server's zone.
	 */
	readonly timeZone: string;
	/**
	 * Whether this session is signed in **as SIMMER** rather than as an
	 * organization.
	 *
	 * The same test `createOperatorAuthContextMiddleware` makes — the selected
	 * WorkOS organization is the operator organization — resolved once here so
	 * that a route serving both kinds of caller can ask without a second query or
	 * a second middleware.
	 *
	 * It exists because operators hold an ordinary organization membership too
	 * (ADR 0011), so a role alone cannot tell an operator from an organization
	 * admin. A command that only SIMMER may send says so through
	 * `CommandPermission`'s `operator` kind, and that kind reads this.
	 *
	 * `false` when `SIMMER_OPERATOR_ORG_ID` is unset, which is the safe reading:
	 * an unconfigured deployment has no operators rather than all of them.
	 */
	readonly isOperator: boolean;
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
	authenticateSession(
		sealedSession: string | undefined,
		options: SessionAuthenticationOptions,
	): Promise<SessionAuthenticationResult>;
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
	/** `null` when unconfigured, which resolves `isOperator` to `false`. */
	readonly operatorOrganizationId?: string | null;
	/**
	 * Whether this caller may spend the session's refresh token.
	 *
	 * Stated at every call site rather than defaulted, because the wrong default
	 * is what #298 was: `/auth/me` is the one caller that may, and a route added
	 * later must decide rather than inherit.
	 */
	readonly mayRefresh: boolean;
}): Promise<AuthContextResult> {
	const session = await options.auth.authenticateSession(options.sealedSession, {
		mayRefresh: options.mayRefresh,
	});

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
			timeZone: resolveOrganizationSettings(localIdentity.organization.settings).settings.timezone,
			isOperator:
				options.operatorOrganizationId != null &&
				session.workosOrganizationId === options.operatorOrganizationId,
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
