import { isBlankSession } from '../is-blank-session.js';
import { loadSealedSession } from '../load-sealed-session.js';
import type { WorkOsAuthContext } from '../workos-auth-context.js';

/**
 * Best-effort revocation of the WorkOS session behind a sealed cookie, so a
 * captured cookie cannot be replayed after logout. Never throws: an expired or
 * invalid session is already revoked for this purpose.
 */
export async function revokeSession(
	context: WorkOsAuthContext,
	sealedSession: string | undefined,
): Promise<void> {
	if (isBlankSession(sealedSession)) {
		return;
	}

	try {
		const authResult = await loadSealedSession(context, sealedSession).authenticate();
		if (authResult.authenticated && authResult.sessionId) {
			await context.workos.userManagement.revokeSession({ sessionId: authResult.sessionId });
		}
	} catch {
		return;
	}
}
