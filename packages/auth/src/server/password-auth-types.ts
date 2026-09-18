import type { AuthChallenge } from '../client/wire.js';
import type { AuthenticatedSession } from './session-authentication.js';

export type { AuthChallenge };

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
