import type { AcceptInvitationInput, AcceptInvitationResult } from './accept-invitation-types.js';
import type { AuthInvitation, InvitationSummary } from './auth-invitation.js';
import type { AuthOrganization } from './auth-organization.js';
import type {
	PasswordAuthResult,
	PasswordSignInInput,
	PasswordSignUpInput,
	ResetPasswordResult,
	SelectOrganizationResult,
	SignUpResult,
	VerifyEmailResult,
} from './password-auth-types.js';
import type {
	AuthenticatedSession,
	SessionAuthenticationOptions,
	SessionAuthenticationResult,
} from './session-authentication.js';

/**
 * Every call this workspace makes to WorkOS. Written out rather than inferred
 * so a method whose signature drifts fails `tsc` at the definition.
 */
export interface WorkOsAuth {
	getAuthorizationUrl(): string;
	authenticateCode(options: {
		readonly code: string;
		readonly ipAddress?: string;
		readonly userAgent?: string;
	}): Promise<AuthenticatedSession>;
	authenticateSession(
		sealedSession: string | undefined,
		options: SessionAuthenticationOptions,
	): Promise<SessionAuthenticationResult>;
	switchOrganization(input: {
		readonly sealedSession: string | undefined;
		readonly workosOrganizationId: string;
	}): Promise<SessionAuthenticationResult>;
	signInWithPassword(input: PasswordSignInInput): Promise<PasswordAuthResult>;
	signUpWithPassword(input: PasswordSignUpInput): Promise<SignUpResult>;
	verifyEmailCode(input: {
		readonly code: string;
		readonly pendingAuthenticationToken: string;
		readonly ipAddress?: string;
		readonly userAgent?: string;
	}): Promise<VerifyEmailResult>;
	authenticateWithOrganizationSelection(input: {
		readonly organizationId: string;
		readonly pendingAuthenticationToken: string;
		readonly ipAddress?: string;
		readonly userAgent?: string;
	}): Promise<SelectOrganizationResult>;
	requestPasswordReset(input: {
		readonly email: string;
	}): Promise<{ readonly passwordResetToken: string; readonly email: string } | null>;
	resetPassword(input: {
		readonly token: string;
		readonly newPassword: string;
	}): Promise<ResetPasswordResult>;
	getInvitationByToken(token: string): Promise<InvitationSummary | null>;
	acceptInvitationWithPassword(input: AcceptInvitationInput): Promise<AcceptInvitationResult>;
	getLogoutUrl(sealedSession: string | undefined): Promise<string | null>;
	revokeSession(sealedSession: string | undefined): Promise<void>;
	getOrganization(workosOrganizationId: string | null): Promise<AuthOrganization | null>;
	createOrganization(input: { readonly name: string }): Promise<AuthOrganization>;
	deactivateOrganizationMembership(input: {
		readonly workosUserId: string;
		readonly workosOrganizationId: string;
	}): Promise<{ readonly status: 'deactivated' | 'not_a_member' }>;
	findOrganizationMember(input: {
		readonly email: string;
		readonly workosOrganizationId: string;
	}): Promise<{
		readonly workosUserId: string;
		readonly status: 'active' | 'inactive' | 'pending';
	} | null>;
	sendOrganizationInvitation(input: {
		readonly email: string;
		readonly workosOrganizationId: string;
		readonly inviterWorkosUserId?: string;
	}): Promise<AuthInvitation>;
	revokeInvitation(
		invitationId: string,
	): Promise<{ readonly status: 'revoked' | 'already_settled' }>;
}
