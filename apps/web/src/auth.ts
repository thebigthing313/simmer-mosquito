import { createAuthClient } from '@simmer-mosquito/auth/browser';

/**
 * This app's binding to the shared browser auth client.
 *
 * The client itself — the `/auth/*` calls and their outcome unions — lives in
 * `@simmer-mosquito/auth/browser`, because the operator console signs in through
 * the same endpoints and two hand-written copies of the outcome parsing drifted
 * as soon as they both existed. What stays here is genuinely this app's: which
 * origins it talks to, the agency-side types, and the re-exports its ~44 call
 * sites read.
 */

const DEFAULT_SERVER_URL = 'http://localhost:3000';

export type { AuthenticatedMe, AuthMe } from '@simmer-mosquito/auth/browser';

export type SimmerRole = 'owner' | 'admin' | 'manager' | 'collector' | 'viewer';
export type MembershipStatus = 'active' | 'inactive' | 'invited';

export interface AdminMembership {
	readonly id: string;
	readonly organizationId: string;
	readonly userId: string | null;
	readonly profileId: string;
	readonly role: SimmerRole;
	readonly status: MembershipStatus;
	readonly isDefault: boolean;
	readonly invitedEmail: string | null;
	readonly workosInvitationId: string | null;
	readonly profile: {
		readonly displayName: string;
		readonly email: string | null;
		readonly isActive: boolean;
	};
	readonly createdAt: string;
	readonly updatedAt: string;
}

export function getServerUrl(): string {
	return trimTrailingSlash(import.meta.env.VITE_SERVER_URL ?? DEFAULT_SERVER_URL);
}

/**
 * Where shape streams are fetched from. A deployment may front them with a
 * separate HTTP/2 proxy; when unset this is just the API origin.
 */
export function getShapeServerUrl(): string {
	return trimTrailingSlash(
		import.meta.env.VITE_SHAPE_SERVER_URL ?? import.meta.env.VITE_SERVER_URL ?? DEFAULT_SERVER_URL,
	);
}

const client = createAuthClient({ serverUrl: getServerUrl() });

export const {
	acceptInvitation,
	fetchInvitation,
	getAuthMe,
	requestPasswordReset,
	resetPassword,
	selectOrganization,
	signIn,
	signUp,
	verifyEmail,
} = client;

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, '');
}
