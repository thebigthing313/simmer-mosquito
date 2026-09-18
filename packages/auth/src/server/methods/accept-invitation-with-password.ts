import type { AcceptInvitationInput, AcceptInvitationResult } from '../accept-invitation-types.js';
import { clientOrigin } from '../client-origin.js';
import { classifyWorkOsFailure } from '../errors/classify-workos-failure.js';
import { findUserByEmail } from '../find-user-by-email.js';
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
	if (existingUser !== null && existingUser.lastSignInAt !== null) {
		return { status: 'account_exists' };
	}

	try {
		if (existingUser !== null) {
			await workos.userManagement.updateUser({
				userId: existingUser.id,
				password: input.password,
				emailVerified: true,
				...personNameFields(input),
			});
		} else {
			await workos.userManagement.createUser({
				email: input.email,
				password: input.password,
				emailVerified: true,
				...personNameFields(input),
			});
		}
	} catch (error) {
		const failure = classifyWorkOsFailure(error);
		switch (failure.kind) {
			case 'email_taken':
				return { status: 'account_exists' };
			case 'password_policy':
				return { status: 'weak_password', message: failure.message };
			default:
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
		const failure = classifyWorkOsFailure(error, { fallbackEmail: input.email });
		switch (failure.kind) {
			case 'invitation_invalid':
				return { status: 'invalid_invitation' };
			case 'challenge':
				return failure.challenge;
			case 'invalid_credentials':
				return { status: 'invalid_credentials' };
			default:
				throw error;
		}
	}
}
