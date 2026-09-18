import type { AcceptInvitationBody } from '@simmer-mosquito/auth/browser';
import type { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth-variables.js';
import { answerAuthResult } from './answer-auth-result.js';
import type { AuthUserRouteDeps } from './auth-user-flows.js';
import { invalidPayloadBody } from './invalid-payload-body.js';
import { nameFields } from './name-fields.js';
import { readAcceptInvitationPayload } from './payloads/read-accept-invitation-payload.js';
import { requestClientHints } from './request-client-hints.js';
import { tooShortPassword } from './too-short-password.js';

/**
 * The invitation's email comes from the token, never from the body, so the
 * password lands on the invited address.
 */
export function registerAcceptInvitation(
	app: Hono<{ Variables: AuthVariables }>,
	deps: AuthUserRouteDeps,
) {
	app.post('/auth/accept-invitation', async (context) => {
		const payload = await readAcceptInvitationPayload(context.req);
		if (!payload.ok) {
			return context.json(invalidPayloadBody(payload.reason), 400);
		}

		const tooShort = tooShortPassword(payload.value.password);
		if (tooShort !== null) {
			return context.json(tooShort, 422);
		}

		const invitation = await deps.auth.session.getInvitationByToken(payload.value.invitationToken);
		if (invitation === null || invitation.state !== 'pending') {
			return answerAuthResult<AcceptInvitationBody>(context, deps.finalizeSession, {
				status: 'invalid_invitation',
			});
		}

		const result = await deps.auth.identity.acceptInvitationWithPassword({
			invitationToken: payload.value.invitationToken,
			email: invitation.email,
			password: payload.value.password,
			...nameFields(payload.value),
			...requestClientHints(context),
		});

		return answerAuthResult<AcceptInvitationBody>(context, deps.finalizeSession, result);
	});
}
