/**
 * The server's WorkOS boundary. The client half is `./browser`, and the shapes
 * both halves name are declared there and re-exported here as types, so a
 * browser bundle never reaches `@workos-inc/node`.
 */

export type { AuthOrganizationChoice, AuthUser } from './browser.js';
export type {
	AcceptInvitationInput,
	AcceptInvitationResult,
} from './server/accept-invitation-types.js';
export type { AuthInvitation, InvitationSummary } from './server/auth-invitation.js';
export type { AuthOrganization } from './server/auth-organization.js';
export { createWorkOsAuth } from './server/create-workos-auth.js';
export type {
	AuthChallenge,
	PasswordAuthResult,
	PasswordSignInInput,
	PasswordSignUpInput,
	ResetPasswordResult,
	SelectOrganizationResult,
	SignUpResult,
	VerifyEmailResult,
} from './server/password-auth-types.js';
export {
	type AuthenticatedSession,
	SESSION_REFRESH_REQUIRED,
	type SessionAuthenticationOptions,
	type SessionAuthenticationResult,
	type UnauthenticatedSession,
} from './server/session-authentication.js';
export type { WorkOsAuth, WorkOsIdentityWrites, WorkOsSessionAuth } from './server/workos-auth.js';
export type { WorkOsAuthConfig } from './server/workos-auth-config.js';
export type { WorkOsClient } from './server/workos-client.js';
export { WORKOS_SESSION_COOKIE_NAME } from './server/workos-session-cookie-name.js';
