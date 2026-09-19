export function renderPasswordResetText(resetUrl: string): string {
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
