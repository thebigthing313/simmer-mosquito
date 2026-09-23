import { classifyWorkOsFailure } from '../errors/classify-workos-failure.js';
import type { PasswordSignUpInput, SignUpResult } from '../password-auth-types.js';
import { personNameFields } from '../person-name-fields.js';
import type { WorkOsAuthContext } from '../workos-auth-context.js';
import { signInWithPassword } from './sign-in-with-password.js';

/**
 * Create the user, then sign in: the sign-in either returns a session or the
 * `verification_required` challenge the client collects the emailed code for.
 */
export async function signUpWithPassword(
	context: WorkOsAuthContext,
	input: PasswordSignUpInput,
): Promise<SignUpResult> {
	try {
		await context.workos.userManagement.createUser({
			email: input.email,
			password: input.password,
			...personNameFields(input),
		});
	} catch (error) {
		const failure = classifyWorkOsFailure(error);
		switch (failure.kind) {
			case 'email_taken':
				return { status: 'email_taken' };
			case 'password_policy':
				return { status: 'weak_password', message: failure.message };
			default:
				throw error;
		}
	}

	return signInWithPassword(context, input);
}
