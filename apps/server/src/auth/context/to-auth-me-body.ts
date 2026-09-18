import type { AuthenticatedMe } from '@simmer-mosquito/auth/browser';
import type { AuthContext } from './auth-context.js';

/**
 * `AuthenticatedMe` with every `localIdentity` field required. The client
 * declaration tolerates a body that omits the optional ones; the one producer
 * is held to all seven (#615).
 */
type CompleteAuthMe = AuthenticatedMe & {
	readonly localIdentity: Required<AuthenticatedMe['localIdentity']>;
};

/**
 * The `/auth/me` body, annotated with the type `packages/auth` owns so a field
 * renamed on either side fails `tsc` rather than arriving `undefined`.
 */
export function toAuthMeBody(authContext: AuthContext): CompleteAuthMe {
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
