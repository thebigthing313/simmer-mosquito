import type { AuthenticatedSession } from '@simmer-mosquito/auth';
import type { AuthenticatedBody } from '@simmer-mosquito/auth/browser';
import type { AuthRouteContext, FinalizeWorkOsSession } from './auth-user-flows.js';

export async function respondAuthenticated(
	context: AuthRouteContext,
	finalizeSession: FinalizeWorkOsSession,
	session: AuthenticatedSession,
) {
	const { organizationRequired } = await finalizeSession(context, session);
	return context.json({ ok: true, organizationRequired } satisfies AuthenticatedBody);
}
