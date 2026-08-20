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

export type MembershipStatus = 'active' | 'inactive' | 'invited';

import type { SimmerRole } from '@simmer-mosquito/domain';

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

/**
 * A `VITE_*` value that is present but empty, read as absent.
 *
 * `??` does not fall back on an empty string, and a build variable arrives
 * empty rather than missing more often than it looks: a Railway field left
 * blank, a `.env` line with nothing after the `=`, or a Docker `ARG` that the
 * image declares and the build does not pass. That last one shipped — the
 * optional `VITE_SHAPE_SERVER_URL` became `''` instead of falling through to
 * the API origin, so shape streams resolved against the static site and never
 * reached the server that injects their auth.
 */
function configured(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

export function getServerUrl(): string {
	return trimTrailingSlash(configured(import.meta.env.VITE_SERVER_URL) ?? DEFAULT_SERVER_URL);
}

/**
 * Where shape streams are fetched from. A deployment may front them with a
 * separate HTTP/2 proxy; when unset this is just the API origin, which is what
 * both deployed environments do — the server injects auth into every shape
 * request, so they have to go through it.
 */
export function getShapeServerUrl(): string {
	return trimTrailingSlash(
		configured(import.meta.env.VITE_SHAPE_SERVER_URL) ??
			configured(import.meta.env.VITE_SERVER_URL) ??
			DEFAULT_SERVER_URL,
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
