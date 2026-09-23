import { classifyWorkOsFailure } from '../errors/classify-workos-failure.js';
import type { WorkOsAuthContext } from '../workos-auth-context.js';

/**
 * Create a WorkOS password reset and return its token; the caller delivers the
 * link, since WorkOS sends no email for this flow. `null` when no user matches,
 * so the endpoint can answer uniformly and not leak account existence.
 */
export async function requestPasswordReset(
	context: WorkOsAuthContext,
	input: { readonly email: string },
): Promise<{ readonly passwordResetToken: string; readonly email: string } | null> {
	try {
		const reset = await context.workos.userManagement.createPasswordReset({ email: input.email });
		return { passwordResetToken: reset.passwordResetToken, email: reset.email };
	} catch (error) {
		switch (classifyWorkOsFailure(error).kind) {
			case 'not_found':
			case 'unprocessable':
				return null;
			default:
				throw error;
		}
	}
}
