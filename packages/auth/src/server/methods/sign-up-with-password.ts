import { isEmailTaken } from '../errors/is-email-taken.js';
import { isPasswordRejection } from '../errors/is-password-rejection.js';
import { readErrorMessage } from '../errors/read-error-message.js';
import type { PasswordSignUpInput, SignUpResult } from '../password-auth-types.js';
import { personNameFields } from '../person-name-fields.js';
import type { WorkOsAuthContext } from '../workos-auth-context.js';
import { signInWithPassword } from './sign-in-with-password.js';

/**
 * Create the user, then sign in: the sign-in either returns a session or the
 * `verification_required` challenge the client collects the emailed code for.
 * `createUser` answers a weak password with a 400 `password_strength_error` (#54).
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
		if (isEmailTaken(error)) {
			return { status: 'email_taken' };
		}

		if (isPasswordRejection(error)) {
			return { status: 'weak_password', message: readErrorMessage(error) };
		}

		throw error;
	}

	return signInWithPassword(context, input);
}
