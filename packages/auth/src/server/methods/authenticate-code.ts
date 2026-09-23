import { clientOrigin } from '../client-origin.js';
import type { AuthenticatedSession } from '../session-authentication.js';
import { toAuthenticatedSession } from '../to-authenticated-session.js';
import { sealSessionOptions, type WorkOsAuthContext } from '../workos-auth-context.js';

export async function authenticateCode(
	context: WorkOsAuthContext,
	options: {
		readonly code: string;
		readonly ipAddress?: string;
		readonly userAgent?: string;
	},
): Promise<AuthenticatedSession> {
	const response = await context.workos.userManagement.authenticateWithCode({
		clientId: context.config.clientId,
		code: options.code,
		...clientOrigin(options),
		session: sealSessionOptions(context.config),
	});

	return toAuthenticatedSession(response);
}
