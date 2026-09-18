import type { WorkOsAuth } from './workos-auth.js';

/**
 * The methods that change durable identity state. Staging authenticates against
 * WorkOS production, so `apps/server/src/workos-identity-interlock.ts` refuses
 * every one of these there (ADR 0017).
 */
export const WORKOS_IDENTITY_WRITE_METHODS = [
	'signUpWithPassword',
	'acceptInvitationWithPassword',
	'requestPasswordReset',
	'resetPassword',
	'createOrganization',
	'sendOrganizationInvitation',
	'revokeInvitation',
	'deactivateOrganizationMembership',
] as const satisfies readonly (keyof WorkOsAuth)[];

/**
 * The methods that still run with the interlock on: reads, and writes whose
 * subject is a session rather than durable identity. `verifyEmailCode` is
 * allowed because it is the second step of a sign-in WorkOS itself asked for.
 */
export const WORKOS_SESSION_AND_READ_METHODS = [
	'getAuthorizationUrl',
	'authenticateCode',
	'authenticateSession',
	'switchOrganization',
	'signInWithPassword',
	'verifyEmailCode',
	'authenticateWithOrganizationSelection',
	'getInvitationByToken',
	'getLogoutUrl',
	'revokeSession',
	'getOrganization',
	'findOrganizationMember',
] as const satisfies readonly (keyof WorkOsAuth)[];

export type WorkOsIdentityWriteMethod = (typeof WORKOS_IDENTITY_WRITE_METHODS)[number];
export type WorkOsSessionAndReadMethod = (typeof WORKOS_SESSION_AND_READ_METHODS)[number];

/**
 * Errors with the offending method names when `T` is not `never`. Local rather
 * than shared, because the idiom has no runtime (#716).
 */
type Assert<T extends never> = T;

/** Every method of {@link WorkOsAuth} is on exactly one of the two lists. */
type _EveryMethodIsClassifiedOnce = Assert<
	| Exclude<keyof WorkOsAuth, WorkOsIdentityWriteMethod | WorkOsSessionAndReadMethod>
	| Extract<WorkOsIdentityWriteMethod, WorkOsSessionAndReadMethod>
>;
