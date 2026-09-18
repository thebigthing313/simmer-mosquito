import type { ForgotPasswordBody } from '@simmer-mosquito/auth/browser';
import type { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth-variables.js';
import type { AuthUserRouteDeps } from './auth-user-flows.js';
import { readEmailPayload } from './payloads/read-email-payload.js';

/** Always answers 200, whether or not the account exists, so the endpoint cannot enumerate emails. */
export function registerForgotPassword(
	app: Hono<{ Variables: AuthVariables }>,
	deps: AuthUserRouteDeps,
) {
	app.post('/auth/forgot-password', async (context) => {
		const payload = await readEmailPayload(context.req);
		if (payload.ok) {
			const reset = await deps.auth.identity.requestPasswordReset({ email: payload.value.email });
			if (reset !== null) {
				const resetUrl = `${deps.appOrigin}/reset-password?token=${encodeURIComponent(reset.passwordResetToken)}`;
				await deps.mailer.sendPasswordResetEmail({ to: reset.email, resetUrl });
			}
		}

		return context.json({ ok: true } satisfies ForgotPasswordBody);
	});
}
