import type { AuthFetch } from './fetch-types.js';

/** The parsed body of a JSON POST to an `/auth/*` path; an unreadable body reads as `{}`. */
export type AuthJsonPost = (path: string, body: unknown) => Promise<unknown>;

export function createAuthJsonPost(authFetch: AuthFetch): AuthJsonPost {
	return async (path, body) => {
		const response = await authFetch(path, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		});

		return response.json().catch(() => ({}));
	};
}
