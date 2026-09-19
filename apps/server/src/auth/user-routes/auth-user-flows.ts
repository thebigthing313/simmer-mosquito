import type {
	AuthenticatedSession,
	WorkOsIdentityWrites,
	WorkOsSessionAuth,
} from '@simmer-mosquito/auth';
import type { Context } from 'hono';
import type { AuthMailer } from '../email/auth-mailer.js';
import type { AuthVariables } from '../middleware/auth-variables.js';

/**
 * What the in-app auth pages drive, picked off both halves of the WorkOS
 * client so a signature that changes in `packages/auth` changes here.
 */
export interface AuthUserFlows {
	readonly session: Pick<
		WorkOsSessionAuth,
		| 'signInWithPassword'
		| 'verifyEmailCode'
		| 'authenticateWithOrganizationSelection'
		| 'switchOrganization'
		| 'getInvitationByToken'
	>;
	readonly identity: Pick<
		WorkOsIdentityWrites,
		'signUpWithPassword' | 'requestPasswordReset' | 'resetPassword' | 'acceptInvitationWithPassword'
	>;
}

/**
 * Runs after any successful WorkOS authentication: upserts the local identity,
 * sets the sealed-session cookie, and reports whether the session still lacks
 * a SIMMER organization.
 */
export type FinalizeWorkOsSession = (
	context: Context<{ Variables: AuthVariables }>,
	session: AuthenticatedSession,
) => Promise<{ readonly organizationRequired: boolean }>;

export interface AuthUserRouteDeps {
	readonly auth: AuthUserFlows;
	readonly mailer: AuthMailer;
	readonly appOrigin: string;
	readonly finalizeSession: FinalizeWorkOsSession;
}

export type AuthRouteContext = Context<{ Variables: AuthVariables }>;
