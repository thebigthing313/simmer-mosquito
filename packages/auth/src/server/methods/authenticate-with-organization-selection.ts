import { clientOrigin } from '../client-origin.js';
import { isBadRequest } from '../errors/is-bad-request.js';
import { isNotFound } from '../errors/is-not-found.js';
import { isUnprocessable } from '../errors/is-unprocessable.js';
import type { SelectOrganizationResult } from '../password-auth-types.js';
import { toAuthenticatedSession } from '../to-authenticated-session.js';
import { sealSessionOptions, type WorkOsAuthContext } from '../workos-auth-context.js';

export async function authenticateWithOrganizationSelection(
	context: WorkOsAuthContext,
	input: {
		readonly organizationId: string;
		readonly pendingAuthenticationToken: string;
		readonly ipAddress?: string;
		readonly userAgent?: string;
	},
): Promise<SelectOrganizationResult> {
	try {
		const response = await context.workos.userManagement.authenticateWithOrganizationSelection({
			clientId: context.config.clientId,
			organizationId: input.organizationId,
			pendingAuthenticationToken: input.pendingAuthenticationToken,
			...clientOrigin(input),
			session: sealSessionOptions(context.config),
		});

		return { status: 'authenticated', session: toAuthenticatedSession(response) };
	} catch (error) {
		if (isBadRequest(error) || isUnprocessable(error) || isNotFound(error)) {
			return { status: 'invalid_selection' };
		}

		throw error;
	}
}
