import { createAuthClient } from '@simmer-mosquito/auth/browser';
import { configured, trimTrailingSlash } from '@simmer-mosquito/config';

/**
 * This app's binding to the shared browser auth client.
 *
 * The client itself — the `/auth/*` calls and their outcome unions — lives in
 * `@simmer-mosquito/auth/browser`, because the operator console signs in
 * through the same endpoints and two hand-written copies of the outcome parsing
 * drifted as soon as they both existed. What stays here is genuinely this
 * app's: which origins it talks to, the organization-side types, and the
 * re-exports its ~44 call sites read.
 */

const DEFAULT_SERVER_URL = 'http://localhost:3000';

export type { AuthenticatedMe, AuthMe } from '@simmer-mosquito/auth/browser';

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
