import type { SignUpBody } from '@simmer-mosquito/auth/browser';
import type { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth-variables.js';
import { answerAuthResult } from './answer-auth-result.js';
import type { AuthUserRouteDeps } from './auth-user-flows.js';
import { invalidPayloadBody } from './invalid-payload-body.js';
import { nameFields } from './name-fields.js';
import { readCredentials } from './payloads/read-credentials.js';
import { requestClientHints } from './request-client-hints.js';
import { tooShortPassword } from './too-short-password.js';

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

		return answerAuthResult<SignUpBody>(context, deps.finalizeSession, result);
	});
}
