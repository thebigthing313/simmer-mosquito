/**
 * The client half of SIMMER's authentication contract: the typed client for the
 * public `POST /auth/*` endpoints and the shape of `/auth/me`. Exported as
 * `./browser` and used by both front ends and `apps/mobile`; it imports nothing
 * from `@workos-inc/node` and touches neither `window` nor the DOM.
 */

export type { AppAuthController } from './client/app-auth-controller.js';
export type { AuthClient } from './client/auth-client.js';
export type {
	AuthenticatedMe,
	AuthMe,
	AuthRefusal,
	AuthUser,
	LocalIdentity,
	RefusedMeBody,
	ServerAuthRefusal,
	UnauthenticatedMe,
} from './client/auth-me.js';
export { cookieFetch } from './client/cookie-fetch.js';
export { createAppAuthController } from './client/create-app-auth-controller.js';
export { createAuthClient } from './client/create-auth-client.js';
export { createSessionRecovery } from './client/create-session-recovery.js';
export type {
	AcceptInvitationOutcome,
	AuthErrorOutcome,
	AuthenticatedOutcome,
	AuthOrganizationChoice,
	InvitationLookup,
	OrganizationSelectionRequiredOutcome,
	ResetPasswordOutcome,
	SelectOrganizationOutcome,
	SignInOutcome,
	SignUpOutcome,
	SwitchOrganizationOutcome,
	VerificationRequiredOutcome,
	VerifyEmailOutcome,
} from './client/outcomes.js';
export { SESSION_LOCK_NAME, type SessionLockManager } from './client/session-lock-manager.js';
export { sessionLostDestination } from './client/session-lost-destination.js';
export type { SessionTransport } from './client/session-transport.js';
