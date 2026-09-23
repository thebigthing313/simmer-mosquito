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
 * The calls that touch session state or read the directory. Every one of them
 * runs on staging, which authenticates against WorkOS production (ADR 0017).
 * `verifyEmailCode` marks an address verified, which is durable, but it is the
 * second step of a sign-in WorkOS itself asked for, so it sits here.
 */
export interface WorkOsSessionAuth {
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
	getInvitationByToken(token: string): Promise<InvitationSummary | null>;
	getLogoutUrl(sealedSession: string | undefined): Promise<string | null>;
	revokeSession(sealedSession: string | undefined): Promise<void>;
	getOrganization(workosOrganizationId: string | null): Promise<AuthOrganization | null>;
	findOrganizationMember(input: {
		readonly email: string;
		readonly workosOrganizationId: string;
	}): Promise<{
		readonly workosUserId: string;
		readonly status: 'active' | 'inactive' | 'pending';
	} | null>;
}

/**
 * The calls that change durable identity state: Accounts, Organizations,
 * Memberships and invitations. Staging refuses every one of them, because each
 * reaches the directory production reaches (ADR 0017). A method belongs here
 * and not on {@link WorkOsSessionAuth} when running it on staging would mail a
 * real address, revoke real access or create a real record.
 */
export interface WorkOsIdentityWrites {
	signUpWithPassword(input: PasswordSignUpInput): Promise<SignUpResult>;
	requestPasswordReset(input: {
		readonly email: string;
	}): Promise<{ readonly passwordResetToken: string; readonly email: string } | null>;
	resetPassword(input: {
		readonly token: string;
		readonly newPassword: string;
	}): Promise<ResetPasswordResult>;
	acceptInvitationWithPassword(input: AcceptInvitationInput): Promise<AcceptInvitationResult>;
	createOrganization(input: { readonly name: string }): Promise<AuthOrganization>;
	deactivateOrganizationMembership(input: {
		readonly workosUserId: string;
		readonly workosOrganizationId: string;
	}): Promise<{ readonly status: 'deactivated' | 'not_a_member' }>;
	sendOrganizationInvitation(input: {
		readonly email: string;
		readonly workosOrganizationId: string;
		readonly inviterWorkosUserId?: string;
	}): Promise<AuthInvitation>;
	revokeInvitation(
		invitationId: string,
	): Promise<{ readonly status: 'revoked' | 'already_settled' }>;
}

/**
 * Every call this workspace makes to WorkOS, in its two halves. The split is
 * the classification the identity interlock enforces: it passes `session`
 * through and refuses every call on `identity`, so a new method is classified
 * by which half it is declared on and there is no list to keep in step.
 */
export interface WorkOsAuth {
	readonly session: WorkOsSessionAuth;
	readonly identity: WorkOsIdentityWrites;
}
