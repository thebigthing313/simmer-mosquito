const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface AuthMailer {
	sendPasswordResetEmail(input: { readonly to: string; readonly resetUrl: string }): Promise<void>;
}

export interface AuthMailerConfig {
	readonly apiKey: string | null;
	readonly from: string;
	readonly nodeEnv: 'development' | 'production' | 'test';
}

/**
 * Delivers the transactional emails SIMMER owns in the headless auth flow.
 *
 * WorkOS mails invitations and email-verification codes itself; the only piece
 * we send is the password-reset link (WorkOS's headless `createPasswordReset`
 * hands us the token instead of emailing it). When no Resend key is configured
 * we log the link in non-production so local development still works, and never
 * throw — a mail-delivery fault must not turn the always-200 forgot-password
 * response into an account-existence oracle.
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

function renderPasswordResetHtml(resetUrl: string): string {
	const safeUrl = escapeHtml(resetUrl);
	return [
		'<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#0f172a">',
		'<h1 style="font-size:20px;margin:0 0 12px">Reset your SIMMER password</h1>',
		'<p style="margin:0 0 16px">We received a request to reset the password for your SIMMER account. Choose a new password using the button below. This link expires shortly.</p>',
		`<p style="margin:0 0 24px"><a href="${safeUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Reset password</a></p>`,
		`<p style="margin:0 0 8px;font-size:13px;color:#64748b">If the button does not work, paste this link into your browser:</p>`,
		`<p style="margin:0;font-size:13px;word-break:break-all"><a href="${safeUrl}">${safeUrl}</a></p>`,
		'<p style="margin:24px 0 0;font-size:13px;color:#64748b">If you did not request this, you can safely ignore this email.</p>',
		'</div>',
	].join('');
}

function renderPasswordResetText(resetUrl: string): string {
	return [
		'Reset your SIMMER password',
		'',
		'We received a request to reset the password for your SIMMER account.',
		'Open this link to choose a new password (it expires shortly):',
		resetUrl,
		'',
		'If you did not request this, you can safely ignore this email.',
	].join('\n');
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
