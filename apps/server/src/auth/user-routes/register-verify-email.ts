import type { VerifyEmailBody } from '@simmer-mosquito/auth/browser';
import type { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth-variables.js';
import { answerAuthResult } from './answer-auth-result.js';
import type { AuthUserRouteDeps } from './auth-user-flows.js';
import { invalidPayloadBody } from './invalid-payload-body.js';
import { readVerifyEmailPayload } from './payloads/read-verify-email-payload.js';
import { requestClientHints } from './request-client-hints.js';

export function registerVerifyEmail(
	app: Hono<{ Variables: AuthVariables }>,
	deps: AuthUserRouteDeps,
) {
	app.post('/auth/verify-email', async (context) => {
		const payload = await readVerifyEmailPayload(context.req);
		if (!payload.ok) {
			return context.json(invalidPayloadBody(payload.reason), 400);
		}

		const result = await deps.auth.session.verifyEmailCode({
			code: payload.value.code,
			pendingAuthenticationToken: payload.value.pendingAuthenticationToken,
			...requestClientHints(context),
		});

		return answerAuthResult<VerifyEmailBody>(context, deps.finalizeSession, result);
	});
}
