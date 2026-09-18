import type { AuthJsonBody } from './create-auth-json-post.js';
import type { VerificationRequiredOutcome } from './outcomes.js';

export function verificationOutcome(data: AuthJsonBody): VerificationRequiredOutcome {
	return {
		status: 'verification_required',
		pendingAuthenticationToken:
			typeof data.pendingAuthenticationToken === 'string' ? data.pendingAuthenticationToken : '',
		email: typeof data.email === 'string' ? data.email : '',
	};
}
