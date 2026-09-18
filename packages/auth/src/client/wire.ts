import type { AuthOrganizationChoice, InvitationLookup } from './outcomes.js';

/**
 * The JSON body each `POST /auth/*` endpoint answers with, declared once for
 * both ends of the wire. `apps/server/src/auth-user-commands.ts` annotates every
 * `context.json` with one of these, and `readAuthOutcome` reads one back, so a
 * status added or renamed on one side fails `tsc` on the other rather than
 * arriving as the client's `error` arm. `/auth/me` has the same arrangement
 * through {@link AuthenticatedMe} and {@link RefusedMeBody} (#615).
 */

/**
 * A further step WorkOS requires before issuing a session. Both arms carry the
 * pending-authentication token the follow-up call trades for a session.
 */
export type AuthChallenge =
	| {
			readonly status: 'verification_required';
			readonly pendingAuthenticationToken: string;
			readonly email: string;
	  }
	| {
			readonly status: 'organization_selection_required';
			readonly pendingAuthenticationToken: string;
			readonly organizations: readonly AuthOrganizationChoice[];
	  };

export interface AuthenticatedBody {
	readonly ok: true;
	readonly organizationRequired: boolean;
}

/** The endpoint did what it was asked and has nothing else to say. */
export interface DoneBody {
	readonly ok: true;
}

export interface RefusedBody<TStatus extends string> {
	readonly ok: false;
	readonly status: TStatus;
}

/** A request body the endpoint could not read; `reason` names the field. */
export type InvalidPayloadBody = RefusedBody<'invalid_payload'> & { readonly reason: string };

export type WeakPasswordBody = RefusedBody<'weak_password'> & { readonly reason: string };

export type VerificationRequiredBody = Extract<AuthChallenge, { status: 'verification_required' }> &
	RefusedBody<'verification_required'>;

export type OrganizationSelectionRequiredBody = Extract<
	AuthChallenge,
	{ status: 'organization_selection_required' }
> &
	RefusedBody<'organization_selection_required'>;

export type ChallengeBody = VerificationRequiredBody | OrganizationSelectionRequiredBody;

export type SignInBody =
	| AuthenticatedBody
	| ChallengeBody
	| RefusedBody<'invalid_credentials'>
	| InvalidPayloadBody;

export type SignUpBody =
	| AuthenticatedBody
	| ChallengeBody
	| RefusedBody<'email_taken' | 'invalid_credentials'>
	| WeakPasswordBody
	| InvalidPayloadBody;

export type VerifyEmailBody =
	| AuthenticatedBody
	| OrganizationSelectionRequiredBody
	| RefusedBody<'invalid_code'>
	| InvalidPayloadBody;

export type SelectOrganizationBody =
	| AuthenticatedBody
	| RefusedBody<'invalid_selection'>
	| InvalidPayloadBody;

export type SwitchOrganizationBody =
	| DoneBody
	| (RefusedBody<'organization_switch_refused'> & { readonly reason: string })
	| InvalidPayloadBody;

export type ForgotPasswordBody = DoneBody | InvalidPayloadBody;

export type ResetPasswordBody =
	| DoneBody
	| WeakPasswordBody
	| RefusedBody<'invalid_token'>
	| InvalidPayloadBody;

export type InvitationLookupBody =
	| (DoneBody & { readonly invitation: InvitationLookup | null })
	| InvalidPayloadBody;

export type AcceptInvitationBody =
	| AuthenticatedBody
	| ChallengeBody
	| RefusedBody<'invalid_invitation' | 'account_exists' | 'invalid_credentials'>
	| WeakPasswordBody
	| InvalidPayloadBody;
