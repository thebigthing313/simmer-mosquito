import type { AcceptInvitationInput, AcceptInvitationResult } from '../accept-invitation-types.js';
import { clientOrigin } from '../client-origin.js';
import { isEmailTaken } from '../errors/is-email-taken.js';
import { isPasswordRejection } from '../errors/is-password-rejection.js';
import { isUnprocessable } from '../errors/is-unprocessable.js';
import { readErrorCode } from '../errors/read-error-code.js';
import { readErrorMessage } from '../errors/read-error-message.js';
import { findUserByEmail } from '../find-user-by-email.js';
import { mapPasswordAuthFailure } from '../map-password-auth-failure.js';
import { personNameFields } from '../person-name-fields.js';
import { toAuthenticatedSession } from '../to-authenticated-session.js';
import { sealSessionOptions, type WorkOsAuthContext } from '../workos-auth-context.js';

/**
 * Set a password on the invitation's provisional user, or create one when none
 * exists, then authenticate with the invitation token so acceptance and sign-in
 * are one step. `emailVerified: true` because holding the mailed token proves
 * the mailbox; without it WorkOS would demand a code the form cannot collect.
 * An account that has signed in before must sign in to accept instead.
 */
export async function acceptInvitationWithPassword(
	context: WorkOsAuthContext,
	input: AcceptInvitationInput,
): Promise<AcceptInvitationResult> {
	const { workos, config } = context;
	const existingUser = await findUserByEmail(workos, input.email);
	if (existingUser !== null) {
		if (existingUser.lastSignInAt !== null) {
			return { status: 'account_exists' };
		}

		try {
			await workos.userManagement.updateUser({
				userId: existingUser.id,
				password: input.password,
				emailVerified: true,
				...personNameFields(input),
			});
		} catch (error) {
			if (isPasswordRejection(error)) {
				return { status: 'weak_password', message: readErrorMessage(error) };
			}

			throw error;
		}
	} else {
		try {
			await workos.userManagement.createUser({
				email: input.email,
				password: input.password,
				emailVerified: true,
				...personNameFields(input),
			});
		} catch (error) {
			if (isEmailTaken(error)) {
				return { status: 'account_exists' };
			}

			if (isUnprocessable(error)) {
				return { status: 'weak_password', message: readErrorMessage(error) };
			}

			throw error;
		}
	}

	try {
		const response = await workos.userManagement.authenticateWithPassword({
			clientId: config.clientId,
			email: input.email,
			password: input.password,
			invitationToken: input.invitationToken,
			...clientOrigin(input),
			session: sealSessionOptions(config),
		});

		return { status: 'authenticated', session: toAuthenticatedSession(response) };
	} catch (error) {
		if (readErrorCode(error) === 'invitation_invalid') {
			return { status: 'invalid_invitation' };
		}

		return mapPasswordAuthFailure(error, input.email);
	}
}
