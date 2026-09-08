import { createAppAuthController, createAuthClient } from '@simmer-mosquito/auth/browser';
import { configured, trimTrailingSlash } from '@simmer-mosquito/config';
import * as SecureStore from 'expo-secure-store';
import { createSessionStore } from './session-store';

/**
 * This app's binding to the shared auth client.
 *
 * The client itself lives in `@simmer-mosquito/auth/browser` — the same one
 * `apps/web` and `apps/admin` use, against the same `POST /auth/*` endpoints.
 * The only thing mobile changes is how the session travels: a SecureStore-backed
 * {@link createSessionStore} instead of the browser's cookie jar.
 *
 * Worth being explicit that this is not a mobile-specific auth path. There is
 * one set of endpoints and one set of outcome unions; the module comment on
 * `browser.ts` records what happened the last time two clients parsed those
 * outcomes separately.
 */

const DEFAULT_SERVER_URL = 'http://localhost:3000';

function getServerUrl(): string {
	return trimTrailingSlash(configured(process.env.EXPO_PUBLIC_SERVER_URL) ?? DEFAULT_SERVER_URL);
}

export const authClient = createAuthClient({
	serverUrl: getServerUrl(),
	session: createSessionStore(SecureStore),
});

/**
 * The signed-in session as one value the whole app reads.
 *
 * Shared with web for the reason its own comment gives: `/auth/me` is a network
 * round trip and more than one place needs the answer, so it is fetched once
 * and subscribed to rather than refetched per consumer.
 */
export const appAuthController = createAppAuthController({
	getAuthMe: authClient.getAuthMe,
});
