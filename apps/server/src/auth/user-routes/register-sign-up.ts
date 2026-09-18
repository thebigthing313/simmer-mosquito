import type { SignUpBody } from '@simmer-mosquito/auth/browser';
import type { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth-variables.js';
import type { AuthUserRouteDeps } from './auth-user-flows.js';
import { challengeBody } from './challenge-body.js';
import { invalidPayloadBody } from './invalid-payload-body.js';
import { nameFields } from './name-fields.js';
import { readCredentials } from './payloads/read-credentials.js';
import { requestClientHints } from './request-client-hints.js';
import { respondAuthenticated } from './respond-authenticated.js';
import { tooShortPassword } from './too-short-password.js';
import { weakPasswordBody } from './weak-password-body.js';

export function registerSignUp(app: Hono<{ Variables: AuthVariables }>, deps: AuthUserRouteDeps) {
	app.post('/auth/sign-up', async (context) => {
		const payload = await readCredentials(context.req, { withName: true });
		if (!payload.ok) {
			return context.json(invalidPayloadBody(payload.reason), 400);
		}

		const tooShort = tooShortPassword(payload.value.password);
		if (tooShort !== null) {
			return context.json(tooShort, 422);
		}

		const result = await deps.auth.identity.signUpWithPassword({
			email: payload.value.email,
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

		if (result.status === 'email_taken') {
			return context.json({ ok: false, status: 'email_taken' } satisfies SignUpBody, 409);
		}

		if (result.status === 'weak_password') {
			return context.json(weakPasswordBody(result.message), 422);
		}

		return context.json({ ok: false, status: 'invalid_credentials' } satisfies SignUpBody, 401);
	});
}
