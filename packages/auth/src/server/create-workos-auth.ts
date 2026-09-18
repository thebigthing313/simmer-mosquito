import { WorkOS } from '@workos-inc/node';

import { acceptInvitationWithPassword } from './methods/accept-invitation-with-password.js';
import { authenticateCode } from './methods/authenticate-code.js';
import { authenticateSession } from './methods/authenticate-session.js';
import { authenticateWithOrganizationSelection } from './methods/authenticate-with-organization-selection.js';
import { createOrganization } from './methods/create-organization.js';
import { deactivateOrganizationMembership } from './methods/deactivate-organization-membership.js';
import { findOrganizationMember } from './methods/find-organization-member.js';
import { getAuthorizationUrl } from './methods/get-authorization-url.js';
import { getInvitationByToken } from './methods/get-invitation-by-token.js';
import { getLogoutUrl } from './methods/get-logout-url.js';
import { getOrganization } from './methods/get-organization.js';
import { requestPasswordReset } from './methods/request-password-reset.js';
import { resetPassword } from './methods/reset-password.js';
import { revokeInvitation } from './methods/revoke-invitation.js';
import { revokeSession } from './methods/revoke-session.js';
import { sendOrganizationInvitation } from './methods/send-organization-invitation.js';
import { signInWithPassword } from './methods/sign-in-with-password.js';
import { signUpWithPassword } from './methods/sign-up-with-password.js';
import { switchOrganization } from './methods/switch-organization.js';
import { verifyEmailCode } from './methods/verify-email-code.js';
import type { WorkOsAuth } from './workos-auth.js';
import type { WorkOsAuthConfig } from './workos-auth-config.js';
import type { WorkOsAuthContext } from './workos-auth-context.js';
import type { WorkOsClient } from './workos-client.js';

/**
 * The server's WorkOS boundary. `client` is constructed from `config` when
 * absent, which is every caller that is not a test.
 */
export function createWorkOsAuth(config: WorkOsAuthConfig, client?: WorkOsClient): WorkOsAuth {
	const context: WorkOsAuthContext = {
		workos: client ?? new WorkOS(config.apiKey, { clientId: config.clientId }),
		config,
	};

	return {
		session: {
			getAuthorizationUrl: () => getAuthorizationUrl(context),
			authenticateCode: (options) => authenticateCode(context, options),
			authenticateSession: (sealedSession, options) =>
				authenticateSession(context, sealedSession, options),
			switchOrganization: (input) => switchOrganization(context, input),
			signInWithPassword: (input) => signInWithPassword(context, input),
			verifyEmailCode: (input) => verifyEmailCode(context, input),
			authenticateWithOrganizationSelection: (input) =>
				authenticateWithOrganizationSelection(context, input),
			getInvitationByToken: (token) => getInvitationByToken(context, token),
			getLogoutUrl: (sealedSession) => getLogoutUrl(context, sealedSession),
			revokeSession: (sealedSession) => revokeSession(context, sealedSession),
			getOrganization: (workosOrganizationId) => getOrganization(context, workosOrganizationId),
			findOrganizationMember: (input) => findOrganizationMember(context, input),
		},
		identity: {
			signUpWithPassword: (input) => signUpWithPassword(context, input),
			requestPasswordReset: (input) => requestPasswordReset(context, input),
			resetPassword: (input) => resetPassword(context, input),
			acceptInvitationWithPassword: (input) => acceptInvitationWithPassword(context, input),
			createOrganization: (input) => createOrganization(context, input),
			deactivateOrganizationMembership: (input) => deactivateOrganizationMembership(context, input),
			sendOrganizationInvitation: (input) => sendOrganizationInvitation(context, input),
			revokeInvitation: (invitationId) => revokeInvitation(context, invitationId),
		},
	};
}
