import { createAppAuthController, createAuthClient } from '@simmer-mosquito/auth/browser';
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

/**
 * A build variable that is present but empty, read as absent.
 *
 * The same trap `apps/web` documents: `??` does not fall back on `''`, and an
 * EAS secret or `.env` line with nothing after the `=` arrives empty rather than
 * missing. On web that shipped once, as shape streams resolving against the
 * static site instead of the API.
 */
function configured(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

function getServerUrl(): string {
	return (configured(process.env.EXPO_PUBLIC_SERVER_URL) ?? DEFAULT_SERVER_URL).replace(/\/+$/, '');
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
