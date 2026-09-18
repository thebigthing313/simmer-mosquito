import type { AuthOrganizationChoice } from '../client/outcomes.js';
import type { AuthenticatedSession } from './session-authentication.js';

export interface PasswordSignInInput {
	readonly email: string;
	readonly password: string;
	readonly ipAddress?: string;
	readonly userAgent?: string;
}

export interface PasswordSignUpInput extends PasswordSignInInput {
	readonly firstName?: string;
	readonly lastName?: string;
}

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

export type PasswordAuthResult =
	| { readonly status: 'authenticated'; readonly session: AuthenticatedSession }
	| AuthChallenge
	| { readonly status: 'invalid_credentials' };

export type SignUpResult =
	| PasswordAuthResult
	| { readonly status: 'email_taken' }
	| { readonly status: 'weak_password'; readonly message: string };

export type VerifyEmailResult =
	| { readonly status: 'authenticated'; readonly session: AuthenticatedSession }
	| Extract<AuthChallenge, { status: 'organization_selection_required' }>
	| { readonly status: 'invalid_code' };

export type SelectOrganizationResult =
	| { readonly status: 'authenticated'; readonly session: AuthenticatedSession }
	| { readonly status: 'invalid_selection' };

export type ResetPasswordResult =
	| { readonly status: 'ok' }
	| { readonly status: 'weak_password'; readonly message: string }
	| { readonly status: 'invalid_token' };
