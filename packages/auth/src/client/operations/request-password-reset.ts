import type { AuthJsonPost } from '../create-auth-json-post.js';

/** The server always answers 200, so registered emails are not revealed. */
export async function requestPasswordReset(
	post: AuthJsonPost,
	input: { readonly email: string },
): Promise<void> {
	await post('/auth/forgot-password', input);
}
