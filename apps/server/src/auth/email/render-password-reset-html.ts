import { escapeHtml } from './escape-html.js';

export function renderPasswordResetHtml(resetUrl: string): string {
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
