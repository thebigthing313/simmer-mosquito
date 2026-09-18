import type { AuthMe } from '../auth-me.js';
import type { AuthFetch } from '../fetch-types.js';

/**
 * The current session. A 401 body still carries `authenticated: false`, which
 * is an answer; only an unreadable response throws. The cast names the type the
 * server's producers are annotated with (#615, #698).
 */
export async function getAuthMe(authFetch: AuthFetch): Promise<AuthMe> {
	const response = await authFetch('/auth/me');
	const body = (await response.json()) as AuthMe;
	if (response.ok || body.authenticated === false) {
		return body;
	}

	throw new Error('Unable to load auth state.');
}
