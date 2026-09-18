import type { SelectOrganizationBody } from '@simmer-mosquito/auth/browser';
import type { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth-variables.js';
import { answerAuthResult } from './answer-auth-result.js';
import type { AuthUserRouteDeps } from './auth-user-flows.js';
import { invalidPayloadBody } from './invalid-payload-body.js';
import { readSelectOrganizationPayload } from './payloads/read-select-organization-payload.js';
import { requestClientHints } from './request-client-hints.js';

/** Resolve a sign-in that is still pending an organization choice. */
export function registerSelectOrganization(
	app: Hono<{ Variables: AuthVariables }>,
	deps: AuthUserRouteDeps,
) {
	app.post('/auth/select-organization', async (context) => {
		const payload = await readSelectOrganizationPayload(context.req);
		if (!payload.ok) {
			return context.json(invalidPayloadBody(payload.reason), 400);
		}

		const result = await deps.auth.session.authenticateWithOrganizationSelection({
			organizationId: payload.value.organizationId,
			pendingAuthenticationToken: payload.value.pendingAuthenticationToken,
			...requestClientHints(context),
		});

		return answerAuthResult<SelectOrganizationBody>(context, deps.finalizeSession, result);
	});
}
