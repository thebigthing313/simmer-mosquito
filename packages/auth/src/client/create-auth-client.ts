import type { AuthClient } from './auth-client.js';
import { createAuthFetch } from './create-auth-fetch.js';
import { createAuthJsonPost } from './create-auth-json-post.js';
import { acceptInvitation } from './operations/accept-invitation.js';
import { fetchInvitation } from './operations/fetch-invitation.js';
import { getAuthMe } from './operations/get-auth-me.js';
import { requestPasswordReset } from './operations/request-password-reset.js';
import { resetPassword } from './operations/reset-password.js';
import { selectOrganization } from './operations/select-organization.js';
import { signIn } from './operations/sign-in.js';
import { signOut } from './operations/sign-out.js';
import { signUp } from './operations/sign-up.js';
import { switchOrganization } from './operations/switch-organization.js';
import { verifyEmail } from './operations/verify-email.js';
import type { SessionTransport } from './session-transport.js';

/**
 * The typed client for the public `/auth/*` endpoints, shared by both front
 * ends and `apps/mobile`. The server URL is injected because each app owns
 * that decision.
 */
export function createAuthClient(options: {
	readonly serverUrl: string;
	readonly session?: SessionTransport;
}): AuthClient {
	const session = options.session ?? null;
	const authFetch = createAuthFetch(options.serverUrl, session);
	const post = createAuthJsonPost(authFetch);

	return {
		acceptInvitation: (input) => acceptInvitation(post, input),
		fetch: authFetch,
		fetchInvitation: (token) => fetchInvitation(authFetch, token),
		getAuthMe: () => getAuthMe(authFetch),
		requestPasswordReset: (input) => requestPasswordReset(post, input),
		resetPassword: (input) => resetPassword(post, input),
		selectOrganization: (input) => selectOrganization(post, input),
		signIn: (input) => signIn(post, input),
		signOut: () => signOut(authFetch, session),
		signUp: (input) => signUp(post, input),
		switchOrganization: (input) => switchOrganization(post, input),
		verifyEmail: (input) => verifyEmail(post, input),
	};
}
