import type { SwitchOrganizationBody } from '@simmer-mosquito/auth/browser';
import type { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth-variables.js';
import { readSealedSession } from '../session-transport/read-sealed-session.js';
import type { AuthUserRouteDeps } from './auth-user-flows.js';
import { invalidPayloadBody } from './invalid-payload-body.js';
import { readSwitchOrganizationPayload } from './payloads/read-switch-organization-payload.js';
import { respondAuthenticated } from './respond-authenticated.js';

/**
 * Re-seal a live session against another organization the user belongs to
 * (ADR 0011). Not behind `authContextMiddleware`, because the caller may hold
 * no SIMMER identity in its current organization; the sealed session is the
 * credential and the membership check is WorkOS's refusal of the refresh.
 */
export function registerSwitchOrganization(
	app: Hono<{ Variables: AuthVariables }>,
	deps: AuthUserRouteDeps,
) {
	app.post('/auth/switch-organization', async (context) => {
		const payload = await readSwitchOrganizationPayload(context.req);
		if (!payload.ok) {
			return context.json(invalidPayloadBody(payload.reason), 400);
		}

		const result = await deps.auth.session.switchOrganization({
			sealedSession: readSealedSession(context),
			workosOrganizationId: payload.value.organizationId,
		});

		if (!result.authenticated) {
			return context.json(
				{
					ok: false,
					status: 'organization_switch_refused',
					reason: result.reason,
				} satisfies SwitchOrganizationBody,
				403,
			);
		}

		return respondAuthenticated(context, deps.finalizeSession, result);
	});
}
