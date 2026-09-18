import type {
	AuthenticatedSession,
	SessionAuthenticationResult,
} from './session-authentication.js';
import { toAuthUser } from './to-auth-user.js';
import type { WorkOsUserLike } from './workos-user-like.js';

/** What the SDK's `authenticate()` and `refresh()` both answer with. */
export type WorkOsSessionResultLike =
	| {
			readonly authenticated: true;
			readonly user: WorkOsUserLike;
			readonly organizationId?: string;
			readonly sessionId: string;
			readonly role?: string;
			readonly sealedSession?: string;
	  }
	| { readonly authenticated: false; readonly reason?: string };

/** The rotated sealed session rides along when the SDK returned one; the caller must re-set it. */
export function toSessionResult(
	result: WorkOsSessionResultLike,
	fallbackReason: string,
): SessionAuthenticationResult {
	if (!result.authenticated) {
		return { authenticated: false, reason: result.reason ?? fallbackReason };
	}

	const session: AuthenticatedSession = {
		authenticated: true,
		user: toAuthUser(result.user),
		workosOrganizationId: result.organizationId ?? null,
		sessionId: result.sessionId,
		role: result.role ?? null,
	};

	return result.sealedSession === undefined
		? session
		: { ...session, sealedSession: result.sealedSession };
}
