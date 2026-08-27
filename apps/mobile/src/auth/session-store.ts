import type { SessionTransport } from '@simmer-mosquito/auth/browser';

/**
 * Where the field app keeps its sealed WorkOS session.
 *
 * The value is the same credential the web apps hold in an httpOnly cookie, so
 * it goes in the platform keystore — Keychain on iOS, EncryptedSharedPreferences
 * on Android — and never in AsyncStorage. `docs/architecture.md` has named
 * SecureStore as the mobile session store since before this app existed.
 *
 * Reads are cached in memory after the first hit. Every authenticated request
 * needs the credential, SecureStore is a native round trip, and the cache is
 * the only thing between one sign-in and a keystore read per HTTP call.
 */

/** The keystore entry. Renaming it signs every installed device out once. */
const SESSION_KEY = 'simmer.session';

export interface SecureStoreLike {
	getItemAsync: (key: string) => Promise<string | null>;
	setItemAsync: (key: string, value: string) => Promise<void>;
	deleteItemAsync: (key: string) => Promise<void>;
}

/**
 * Build the transport over a keystore.
 *
 * Takes the store rather than importing `expo-secure-store` directly so the
 * caching and failure behaviour below can be tested without a native module;
 * `session-store.ts` is otherwise the one part of sign-in with no way to
 * observe it going wrong.
 */
export function createSessionStore(store: SecureStoreLike): SessionTransport {
	let cached: string | null | undefined;

	return {
		async read(): Promise<string | null> {
			if (cached !== undefined) {
				return cached;
			}

			try {
				cached = await store.getItemAsync(SESSION_KEY);
			} catch {
				/*
				 * An unreadable keystore is not a session, but it is also not a crash.
				 * Answering `null` sends the user to the sign-in screen, which is the
				 * one recovery available from inside the app — and deliberately does
				 * not cache that answer, so a transient failure does not latch until
				 * the process restarts.
				 */
				return null;
			}

			return cached;
		},

		async write(sealedSession: string): Promise<void> {
			cached = sealedSession;
			await store.setItemAsync(SESSION_KEY, sealedSession);
		},

		async clear(): Promise<void> {
			cached = null;
			await store.deleteItemAsync(SESSION_KEY);
		},
	};
}
