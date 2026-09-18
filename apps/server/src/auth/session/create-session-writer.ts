import type { WorkOsSessionAuth } from '@simmer-mosquito/auth';
import type { upsertWorkOsIdentity } from '@simmer-mosquito/db';
import type { SetAuthCookie } from '../middleware/set-auth-cookie.js';
import { writeSealedSession } from '../session-transport/write-sealed-session.js';
import type { FinalizeWorkOsSession } from '../user-routes/auth-user-flows.js';

/**
 * The two writes every successful sign-in ends on, built once in `main.ts`.
 * `setAuthCookie` hands the sealed session back on whichever transport the
 * caller uses, and `finalizeSession` upserts the WorkOS identity locally, sets
 * the cookie, and says whether the session still lacks a SIMMER organization.
 */
export function createSessionWriter(options: {
	readonly db: Parameters<typeof upsertWorkOsIdentity>[0];
	readonly auth: Pick<WorkOsSessionAuth, 'getOrganization'>;
	readonly upsertIdentity: typeof upsertWorkOsIdentity;
	readonly secure: boolean;
}): { readonly setAuthCookie: SetAuthCookie; readonly finalizeSession: FinalizeWorkOsSession } {
	const setAuthCookie: SetAuthCookie = (context, sealedSession) => {
		writeSealedSession(context, sealedSession, { secure: options.secure });
	};

	return {
		setAuthCookie,
		finalizeSession: async (context, session) => {
			const organization = await options.auth.getOrganization(session.workosOrganizationId);
			const localIdentity = await options.upsertIdentity(options.db, {
				...session.user,
				workosOrganizationId: session.workosOrganizationId,
				workosOrganizationName: organization?.name ?? null,
				workosRole: session.role,
			});

			setAuthCookie(context, session.sealedSession);

			return { organizationRequired: localIdentity.organizationId === null };
		},
	};
}
