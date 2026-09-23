import type { InvitationLookupBody } from '@simmer-mosquito/auth/browser';
import type { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth-variables.js';
import type { AuthUserRouteDeps } from './auth-user-flows.js';
import { invalidPayloadBody } from './invalid-payload-body.js';

export function registerInvitationLookup(
	app: Hono<{ Variables: AuthVariables }>,
	deps: AuthUserRouteDeps,
) {
	app.get('/auth/invitation', async (context) => {
		const token = context.req.query('token');
		if (token === undefined || token.trim() === '') {
			return context.json(invalidPayloadBody('token is required.'), 400);
		}

		const invitation = await deps.auth.session.getInvitationByToken(token);
		if (invitation === null) {
			return context.json({ ok: true, invitation: null } satisfies InvitationLookupBody);
		}

		return context.json({
			ok: true,
			invitation: { email: invitation.email, state: invitation.state },
		} satisfies InvitationLookupBody);
	});
}
