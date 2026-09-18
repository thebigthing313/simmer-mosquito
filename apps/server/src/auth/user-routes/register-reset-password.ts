import type { ResetPasswordBody } from '@simmer-mosquito/auth/browser';
import type { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth-variables.js';
import type { AuthUserRouteDeps } from './auth-user-flows.js';
import { invalidPayloadBody } from './invalid-payload-body.js';
import { readResetPasswordPayload } from './payloads/read-reset-password-payload.js';
import { tooShortPassword } from './too-short-password.js';
import { weakPasswordBody } from './weak-password-body.js';

export function registerResetPassword(
	app: Hono<{ Variables: AuthVariables }>,
	deps: AuthUserRouteDeps,
) {
	app.post('/auth/reset-password', async (context) => {
		const payload = await readResetPasswordPayload(context.req);
		if (!payload.ok) {
			return context.json(invalidPayloadBody(payload.reason), 400);
		}

		const tooShort = tooShortPassword(payload.value.newPassword);
		if (tooShort !== null) {
			return context.json(tooShort, 422);
		}

		const result = await deps.auth.identity.resetPassword({
			token: payload.value.token,
			newPassword: payload.value.newPassword,
		});

		if (result.status === 'ok') {
			return context.json({ ok: true } satisfies ResetPasswordBody);
		}

		if (result.status === 'weak_password') {
			return context.json(weakPasswordBody(result.message), 422);
		}

		return context.json({ ok: false, status: 'invalid_token' } satisfies ResetPasswordBody, 400);
	});
}
