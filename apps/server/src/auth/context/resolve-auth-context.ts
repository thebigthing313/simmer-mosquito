import { resolveOrganizationSettings } from '@simmer-mosquito/domain';
import type { AuthContextResult } from './auth-context.js';
import type { AuthSessionProvider } from './auth-session-provider.js';
import type { LocalAuthIdentityResolver } from './local-auth-identity-resolver.js';
import { unauthenticatedRefusal } from './unauthenticated-refusal.js';

/**
 * Verify the session, then resolve the SIMMER identity behind it. A rotated
 * sealed session rides on every arm that had one, so the caller can re-set it
 * whether or not the identity resolved.
 */
export async function resolveAuthContext(options: {
	readonly sealedSession: string | undefined;
	readonly auth: AuthSessionProvider;
	readonly localIdentityResolver: LocalAuthIdentityResolver;
	/** `null` when unconfigured, which resolves `isOperator` to `false`. */
	readonly operatorOrganizationId?: string | null;
	/**
	 * Whether this caller may spend the session's refresh token. Stated at every
	 * call site rather than defaulted: `/auth/me` is the one caller that may
	 * (#298), and a route added later must decide rather than inherit.
	 */
	readonly mayRefresh: boolean;
}): Promise<AuthContextResult> {
	const session = await options.auth.authenticateSession(options.sealedSession, {
		mayRefresh: options.mayRefresh,
	});

	if (!session.authenticated) {
		return unauthenticatedRefusal(session.reason);
	}

	const rotated =
		session.sealedSession === undefined ? {} : { sealedSession: session.sealedSession };

	if (session.workosOrganizationId === null) {
		return {
			ok: false,
			status: 403,
			error: {
				type: 'organization_required',
				reason: 'WorkOS session has no selected organization.',
			},
			...rotated,
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
			...rotated,
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
		...rotated,
	};
}
