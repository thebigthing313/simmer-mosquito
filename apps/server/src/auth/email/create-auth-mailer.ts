import type { AuthMailer, AuthMailerConfig } from './auth-mailer.js';
import { renderPasswordResetHtml } from './render-password-reset-html.js';
import { renderPasswordResetText } from './render-password-reset-text.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * The one transactional email SIMMER sends itself: the password-reset link,
 * since WorkOS's headless `createPasswordReset` hands back the token. Without a
 * Resend key the link is logged outside production. Never throws, because a
 * delivery fault must not turn the always-200 forgot-password response into an
 * account-existence oracle.
 */
export function createAuthMailer(config: AuthMailerConfig): AuthMailer {
	return {
		async sendPasswordResetEmail(input) {
			if (config.apiKey === null) {
				if (config.nodeEnv === 'production') {
					console.error(
						'[auth-email] RESEND_API_KEY is not set; password reset email was not sent.',
					);
				} else {
					console.warn(
						`[auth-email] (dev, no RESEND_API_KEY) password reset link: ${input.resetUrl}`,
					);
				}
				return;
			}

			try {
				const response = await fetch(RESEND_ENDPOINT, {
					method: 'POST',
					headers: {
						authorization: `Bearer ${config.apiKey}`,
						'content-type': 'application/json',
					},
					body: JSON.stringify({
						from: config.from,
						to: [input.to],
						subject: 'Reset your SIMMER password',
						html: renderPasswordResetHtml(input.resetUrl),
						text: renderPasswordResetText(input.resetUrl),
					}),
				});

				if (!response.ok) {
					const detail = await response.text().catch(() => '');
					console.error(
						`[auth-email] Resend rejected password reset email (${response.status}): ${detail}`,
					);
				}
			} catch (error) {
				console.error('[auth-email] Failed to send password reset email.', error);
			}
		},
	};
}
