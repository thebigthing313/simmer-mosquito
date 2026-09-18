import { openSealedSession } from '../sealed-session.js';
import type { WorkOsAuthContext } from '../workos-auth-context.js';

/** Best-effort revocation on logout, so a captured cookie cannot be replayed. */
export async function revokeSession(
	context: WorkOsAuthContext,
	sealedSession: string | undefined,
): Promise<void> {
	await openSealedSession(context, sealedSession)?.revoke();
}
