import type { VerificationRequiredOutcome } from './outcomes.js';
import type { VerificationRequiredBody } from './wire.js';

export function verificationOutcome(body: VerificationRequiredBody): VerificationRequiredOutcome {
	return {
		status: 'verification_required',
		pendingAuthenticationToken: body.pendingAuthenticationToken,
		email: body.email,
	};
}
