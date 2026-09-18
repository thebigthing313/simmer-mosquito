/** A WorkOS OAuth-style authentication rejection: wrong password, sso_required, mfa. */
export function isOauthException(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		(error as { readonly name?: unknown }).name === 'OauthException'
	);
}
