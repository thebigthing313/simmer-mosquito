/**
 * `fetch` with the session cookie the browser holds, which is what `apps/web`
 * and `apps/admin` install into `packages/sync`. The token counterpart is
 * `AuthClient.fetch`.
 */
export const cookieFetch: typeof fetch = (input, init) =>
	// session-credential-ignore: this is the transport an app installs, not a caller of one.
	fetch(input, { ...init, credentials: 'include' });
