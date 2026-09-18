import { clientOrigin } from '../client-origin.js';
import { isBadRequest } from '../errors/is-bad-request.js';
import { isUnprocessable } from '../errors/is-unprocessable.js';
import type { VerifyEmailResult } from '../password-auth-types.js';
import { readAuthChallenge } from '../read-auth-challenge.js';
import { toAuthenticatedSession } from '../to-authenticated-session.js';
import { sealSessionOptions, type WorkOsAuthContext } from '../workos-auth-context.js';

/** A multi-organization user may still owe an organization choice after the code checks out. */
export async function verifyEmailCode(
	context: WorkOsAuthContext,
	input: {
		readonly code: string;
		readonly pendingAuthenticationToken: string;
		readonly ipAddress?: string;
		readonly userAgent?: string;
	},
): Promise<VerifyEmailResult> {
	try {
		const response = await context.workos.userManagement.authenticateWithEmailVerification({
			clientId: context.config.clientId,
			code: input.code,
			pendingAuthenticationToken: input.pendingAuthenticationToken,
			...clientOrigin(input),
			session: sealSessionOptions(context.config),
		});

		return { status: 'authenticated', session: toAuthenticatedSession(response) };
	} catch (error) {
		const challenge = readAuthChallenge(error, '');
		if (challenge?.status === 'organization_selection_required') {
			return challenge;
		}

		if (isBadRequest(error) || isUnprocessable(error)) {
			return { status: 'invalid_code' };
		}

		throw error;
	}
}
