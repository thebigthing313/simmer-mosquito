import { clientOrigin } from '../client-origin.js';
import { classifyWorkOsFailure } from '../errors/classify-workos-failure.js';
import type { VerifyEmailResult } from '../password-auth-types.js';
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
		const failure = classifyWorkOsFailure(error);
		switch (failure.kind) {
			case 'challenge':
				if (failure.challenge.status === 'organization_selection_required') {
					return failure.challenge;
				}
				return { status: 'invalid_code' };
			case 'bad_request':
			case 'unprocessable':
				return { status: 'invalid_code' };
			default:
				throw error;
		}
	}
}
