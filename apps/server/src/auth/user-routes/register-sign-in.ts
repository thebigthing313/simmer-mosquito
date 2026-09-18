import type { SignInBody } from '@simmer-mosquito/auth/browser';
import type { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth-variables.js';
import type { AuthUserRouteDeps } from './auth-user-flows.js';
import { challengeBody } from './challenge-body.js';
import { invalidPayloadBody } from './invalid-payload-body.js';
import { readCredentials } from './payloads/read-credentials.js';
import { requestClientHints } from './request-client-hints.js';
import { respondAuthenticated } from './respond-authenticated.js';

export function registerSignIn(app: Hono<{ Variables: AuthVariables }>, deps: AuthUserRouteDeps) {
	app.post('/auth/sign-in', async (context) => {
		const payload = await readCredentials(context.req);
		if (!payload.ok) {
			return context.json(invalidPayloadBody(payload.reason), 400);
		}

		const result = await deps.auth.session.signInWithPassword({
			email: payload.value.email,
			password: payload.value.password,
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

		return context.json({ ok: false, status: 'invalid_credentials' } satisfies SignInBody, 401);
	});
}
