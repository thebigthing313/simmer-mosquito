import type { AuthFetch } from '../fetch-types.js';
import type { SessionTransport } from '../session-transport.js';

/**
 * End the session from inside the app. The server-side revoke is best effort;
 * clearing the stored credential is what signs a token client out, so an
 * offline user still gets to sign out.
 */
export async function signOut(
	authFetch: AuthFetch,
	session: SessionTransport | null,
): Promise<void> {
	try {
		await authFetch('/auth/logout', { method: 'POST' });
	} catch {
		// The stored credential below is what gates the session.
	}

	await session?.clear();
}
