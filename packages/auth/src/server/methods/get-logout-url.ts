import { openSealedSession } from '../sealed-session.js';
import type { WorkOsAuthContext } from '../workos-auth-context.js';

export async function getLogoutUrl(
	context: WorkOsAuthContext,
	sealedSession: string | undefined,
): Promise<string | null> {
	return openSealedSession(context, sealedSession)?.logoutUrl() ?? null;
}
