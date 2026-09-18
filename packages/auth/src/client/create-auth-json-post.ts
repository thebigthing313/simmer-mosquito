import type { AuthFetch } from './fetch-types.js';

export type AuthJsonBody = Record<string, unknown>;

export type AuthJsonPost = (
	path: string,
	body: unknown,
) => Promise<{ readonly httpOk: boolean; readonly data: AuthJsonBody }>;

/** A JSON POST to an `/auth/*` path; an unreadable body reads as `{}`. */
export function createAuthJsonPost(authFetch: AuthFetch): AuthJsonPost {
	return async (path, body) => {
		const response = await authFetch(path, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		});

		const data = (await response.json().catch(() => ({}))) as AuthJsonBody;
		return { httpOk: response.ok, data };
	};
}
