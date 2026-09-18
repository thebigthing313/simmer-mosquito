import { isBlankSession } from '../is-blank-session.js';
import { loadSealedSession } from '../load-sealed-session.js';
import type { WorkOsAuthContext } from '../workos-auth-context.js';

export async function getLogoutUrl(
	context: WorkOsAuthContext,
	sealedSession: string | undefined,
): Promise<string | null> {
	if (isBlankSession(sealedSession)) {
		return null;
	}

	return loadSealedSession(context, sealedSession).getLogoutUrl();
}
