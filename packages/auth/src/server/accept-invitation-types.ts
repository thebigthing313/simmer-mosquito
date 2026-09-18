import type { AuthChallenge } from './password-auth-types.js';
import type { AuthenticatedSession } from './session-authentication.js';

export interface AcceptInvitationInput {
	readonly invitationToken: string;
	readonly email: string;
	readonly password: string;
	readonly firstName?: string;
	readonly lastName?: string;
	readonly ipAddress?: string;
	readonly userAgent?: string;
}

export type AcceptInvitationResult =
	| { readonly status: 'authenticated'; readonly session: AuthenticatedSession }
	| AuthChallenge
	| { readonly status: 'invalid_invitation' }
	| { readonly status: 'account_exists' }
	| { readonly status: 'weak_password'; readonly message: string }
	| { readonly status: 'invalid_credentials' };
