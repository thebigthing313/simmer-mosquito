import type { AcceptInvitationBody } from '@simmer-mosquito/auth/browser';
import type { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth-variables.js';
import type { AuthUserRouteDeps } from './auth-user-flows.js';
import { challengeBody } from './challenge-body.js';
import { invalidPayloadBody } from './invalid-payload-body.js';
import { nameFields } from './name-fields.js';
import { readAcceptInvitationPayload } from './payloads/read-accept-invitation-payload.js';
import { requestClientHints } from './request-client-hints.js';
import { respondAuthenticated } from './respond-authenticated.js';
import { tooShortPassword } from './too-short-password.js';
import { weakPasswordBody } from './weak-password-body.js';

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
			return context.json(
				{ ok: false, status: 'invalid_invitation' } satisfies AcceptInvitationBody,
				400,
			);
		}

		const result = await deps.auth.identity.acceptInvitationWithPassword({
			invitationToken: payload.value.invitationToken,
			email: invitation.email,
			password: payload.value.password,
			...nameFields(payload.value),
			...requestClientHints(context),
		});

		if (result.status === 'authenticated') {
			return respondAuthenticated(context, deps.finalizeSession, result.session);
		}

		if (
			result.status === 'verification_required' ||
			result.status === 'organization_selection_required'
		) {
			return context.json(challengeBody(result));
		}

		if (result.status === 'account_exists') {
			return context.json(
				{ ok: false, status: 'account_exists' } satisfies AcceptInvitationBody,
				409,
			);
		}

		if (result.status === 'weak_password') {
			return context.json(weakPasswordBody(result.message), 422);
		}

		if (result.status === 'invalid_invitation') {
			return context.json(
				{ ok: false, status: 'invalid_invitation' } satisfies AcceptInvitationBody,
				400,
			);
		}

		return context.json(
			{ ok: false, status: 'invalid_credentials' } satisfies AcceptInvitationBody,
			401,
		);
	});
}
