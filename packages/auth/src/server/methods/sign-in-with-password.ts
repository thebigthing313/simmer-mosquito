import { clientOrigin } from '../client-origin.js';
import { mapPasswordAuthFailure } from '../map-password-auth-failure.js';
import type { PasswordAuthResult, PasswordSignInInput } from '../password-auth-types.js';
import { toAuthenticatedSession } from '../to-authenticated-session.js';
import { sealSessionOptions, type WorkOsAuthContext } from '../workos-auth-context.js';

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
		return mapPasswordAuthFailure(error, input.email);
	}
}
