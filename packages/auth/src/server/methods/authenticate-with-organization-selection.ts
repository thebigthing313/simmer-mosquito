import { clientOrigin } from '../client-origin.js';
import { classifyWorkOsFailure } from '../errors/classify-workos-failure.js';
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
		switch (classifyWorkOsFailure(error).kind) {
			case 'bad_request':
			case 'unprocessable':
			case 'not_found':
				return { status: 'invalid_selection' };
			default:
				throw error;
		}
	}
}
