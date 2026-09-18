import type { AuthMe } from './auth-me.js';
import type {
	AcceptInvitationOutcome,
	InvitationLookup,
	ResetPasswordOutcome,
	SelectOrganizationOutcome,
	SignInOutcome,
	SignUpOutcome,
	SwitchOrganizationOutcome,
	VerifyEmailOutcome,
} from './outcomes.js';

/** Everything the client can do, bound to one server origin. */
export interface AuthClient {
	/**
	 * Send a request with whatever credential this client carries. A string
	 * beginning with `/` is a path on this client's `serverUrl`; anything else
	 * passes through, so `packages/sync` can install this as its `fetch`.
	 */
	readonly fetch: typeof fetch;
	readonly getAuthMe: () => Promise<AuthMe>;
	readonly signIn: (input: {
		readonly email: string;
		readonly password: string;
	}) => Promise<SignInOutcome>;
	readonly signUp: (input: {
		readonly email: string;
		readonly password: string;
		readonly firstName?: string;
		readonly lastName?: string;
	}) => Promise<SignUpOutcome>;
	readonly verifyEmail: (input: {
		readonly code: string;
		readonly pendingAuthenticationToken: string;
	}) => Promise<VerifyEmailOutcome>;
	readonly selectOrganization: (input: {
		readonly organizationId: string;
		readonly pendingAuthenticationToken: string;
	}) => Promise<SelectOrganizationOutcome>;
	readonly switchOrganization: (input: {
		readonly organizationId: string;
	}) => Promise<SwitchOrganizationOutcome>;
	readonly requestPasswordReset: (input: { readonly email: string }) => Promise<void>;
	readonly resetPassword: (input: {
		readonly token: string;
		readonly newPassword: string;
	}) => Promise<ResetPasswordOutcome>;
	readonly fetchInvitation: (token: string) => Promise<InvitationLookup | null>;
	readonly acceptInvitation: (input: {
		readonly invitationToken: string;
		readonly password: string;
		readonly firstName?: string;
		readonly lastName?: string;
	}) => Promise<AcceptInvitationOutcome>;
	/**
	 * End the session from inside the app. The web apps log out through a
	 * top-level navigation to `/auth/logout` instead; a token client has no
	 * cookie to clear, so its local `clear()` is the logout.
	 */
	readonly signOut: () => Promise<void>;
}
