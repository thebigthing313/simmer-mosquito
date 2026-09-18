import { clientOrigin } from '../client-origin.js';
import { classifyWorkOsFailure } from '../errors/classify-workos-failure.js';
import type { PasswordAuthResult, PasswordSignInInput } from '../password-auth-types.js';
import { toAuthenticatedSession } from '../to-authenticated-session.js';
import { sealSessionOptions, type WorkOsAuthContext } from '../workos-auth-context.js';

/** Every rejection that is not a challenge reads as invalid credentials, so no reason leaks. */
export async function signInWithPassword(
	context: WorkOsAuthContext,
	input: PasswordSignInInput,
): Promise<PasswordAuthResult> {
	try {
		const response = await context.workos.userManagement.authenticateWithPassword({
			clientId: context.config.clientId,
			email: input.email,
			password: input.password,
			...clientOrigin(input),
			session: sealSessionOptions(context.config),
		});

		return { status: 'authenticated', session: toAuthenticatedSession(response) };
	} catch (error) {
		const failure = classifyWorkOsFailure(error, { fallbackEmail: input.email });
		switch (failure.kind) {
			case 'challenge':
				return failure.challenge;
			case 'invalid_credentials':
				return { status: 'invalid_credentials' };
			default:
				throw error;
		}
	}
}
