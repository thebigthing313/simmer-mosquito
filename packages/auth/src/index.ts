import { WorkOS } from '@workos-inc/node';

export const WORKOS_SESSION_COOKIE_NAME = 'wos-session';

export interface WorkOsAuthConfig {
	readonly apiKey: string;
	readonly clientId: string;
	readonly cookiePassword: string;
	readonly redirectUri: string;
}

export interface AuthUser {
	readonly workosUserId: string;
	readonly email: string;
	readonly firstName: string | null;
	readonly lastName: string | null;
	readonly displayName: string;
	readonly emailVerified: boolean | null;
	readonly profilePictureUrl: string | null;
}

export interface AuthOrganization {
	readonly workosOrganizationId: string;
	readonly name: string;
}

export interface AuthInvitation {
	readonly id: string;
	readonly email: string;
	readonly state: 'pending' | 'accepted' | 'expired' | 'revoked';
	readonly organizationId: string | null;
	readonly acceptedUserId: string | null;
	readonly expiresAt: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface AuthenticatedSession {
	readonly authenticated: true;
	readonly user: AuthUser;
	readonly workosOrganizationId: string | null;
	readonly sessionId: string | null;
	readonly role: string | null;
	readonly sealedSession?: string;
}

export interface UnauthenticatedSession {
	readonly authenticated: false;
	readonly reason: string;
}

export type SessionAuthenticationResult = AuthenticatedSession | UnauthenticatedSession;

/**
 * What a caller is allowed to do with a session whose access token has expired.
 *
 * A WorkOS refresh token is single use: spending it issues a replacement and
 * invalidates the one spent. So "refresh the session" is a write, and letting
 * every authenticated route do it meant the browser's concurrent requests spent
 * the same token more than once. That is WorkOS's reuse signature, and the
 * browser only keeps the last of the several rotated cookies it is sent, so the
 * session died within about a minute of signing in (#298).
 *
 * `mayRefresh` moves that write to one endpoint. `/auth/me` sets it, because the
 * browser calls that deliberately, one at a time, and always reads the response.
 * Everything else verifies the access token and answers
 * {@link SESSION_REFRESH_REQUIRED} when it has expired, which the client
 * answers by calling `/auth/me` and retrying.
 */
export interface SessionAuthenticationOptions {
	readonly mayRefresh: boolean;
}

/**
 * The session is good but its access token has expired, and this caller may not
 * be the one to renew it.
 *
 * Distinct from every other refusal reason because it is the one a client can
 * act on: ask `/auth/me`, then retry. A client that cannot tell it apart would
 * either sign the user out on an expiry or retry a genuine refusal forever.
 */
export const SESSION_REFRESH_REQUIRED = 'session_refresh_required';

export interface PasswordSignInInput {
	readonly email: string;
	readonly password: string;
	readonly ipAddress?: string;
	readonly userAgent?: string;
}

export interface PasswordSignUpInput extends PasswordSignInInput {
	readonly firstName?: string;
	readonly lastName?: string;
}

export interface AuthOrganizationChoice {
	readonly id: string;
	readonly name: string;
}

/**
 * An extra step WorkOS requires before it will issue a session:
 * - `verification_required` — the user must enter the emailed verification code.
 * - `organization_selection_required` — the user belongs to more than one
 *   organization and must pick which one to sign into.
 * Both carry the pending-authentication token that the follow-up call trades for
 * a session.
 */
export type AuthChallenge =
	| {
			readonly status: 'verification_required';
			readonly pendingAuthenticationToken: string;
			readonly email: string;
	  }
	| {
			readonly status: 'organization_selection_required';
			readonly pendingAuthenticationToken: string;
			readonly organizations: readonly AuthOrganizationChoice[];
	  };

/** Normalized outcome of a password authentication attempt. */
export type PasswordAuthResult =
	| { readonly status: 'authenticated'; readonly session: AuthenticatedSession }
	| AuthChallenge
	| { readonly status: 'invalid_credentials' };

export type SignUpResult =
	| PasswordAuthResult
	| { readonly status: 'email_taken' }
	| { readonly status: 'weak_password'; readonly message: string };

export type VerifyEmailResult =
	| { readonly status: 'authenticated'; readonly session: AuthenticatedSession }
	| Extract<AuthChallenge, { status: 'organization_selection_required' }>
	| { readonly status: 'invalid_code' };

export type SelectOrganizationResult =
	| { readonly status: 'authenticated'; readonly session: AuthenticatedSession }
	| { readonly status: 'invalid_selection' };

export type ResetPasswordResult =
	| { readonly status: 'ok' }
	| { readonly status: 'weak_password'; readonly message: string }
	| { readonly status: 'invalid_token' };

export interface InvitationSummary {
	readonly id: string;
	readonly email: string;
	readonly state: 'pending' | 'accepted' | 'expired' | 'revoked';
	readonly organizationId: string | null;
}

export interface AcceptInvitationInput {
	readonly invitationToken: string;
	readonly email: string;
	readonly password: string;
	readonly firstName?: string;
	readonly lastName?: string;
	readonly ipAddress?: string;
	readonly userAgent?: string;
}

export type AcceptInvitationResult =
	| { readonly status: 'authenticated'; readonly session: AuthenticatedSession }
	| AuthChallenge
	| { readonly status: 'invalid_invitation' }
	| { readonly status: 'account_exists' }
	| { readonly status: 'weak_password'; readonly message: string }
	| { readonly status: 'invalid_credentials' };

interface WorkOsUserLike {
	readonly id: string;
	readonly email: string;
	readonly firstName?: string | null;
	readonly lastName?: string | null;
	readonly emailVerified?: boolean | null;
	readonly profilePictureUrl?: string | null;
}

export function createWorkOsAuth(config: WorkOsAuthConfig) {
	const workos = new WorkOS(config.apiKey, {
		clientId: config.clientId,
	});

	const sessionSealOptions = {
		sealSession: true,
		cookiePassword: config.cookiePassword,
	} as const;

	return {
		getAuthorizationUrl(): string {
			return workos.userManagement.getAuthorizationUrl({
				provider: 'authkit',
				redirectUri: config.redirectUri,
				clientId: config.clientId,
			});
		},

		async authenticateCode(options: {
			readonly code: string;
			readonly ipAddress?: string;
			readonly userAgent?: string;
		}): Promise<AuthenticatedSession> {
			const request = {
				clientId: config.clientId,
				code: options.code,
				...(options.ipAddress === undefined ? {} : { ipAddress: options.ipAddress }),
				...(options.userAgent === undefined ? {} : { userAgent: options.userAgent }),
				session: {
					sealSession: true,
					cookiePassword: config.cookiePassword,
				},
			};

			const response = await workos.userManagement.authenticateWithCode({
				...request,
			});

			if (response.sealedSession === undefined) {
				throw new Error('WorkOS did not return a sealed session.');
			}

			return {
				authenticated: true,
				user: toAuthUser(response.user),
				workosOrganizationId: response.organizationId ?? null,
				sessionId: null,
				role: null,
				sealedSession: response.sealedSession,
			};
		},

		async authenticateSession(
			sealedSession: string | undefined,
			options: SessionAuthenticationOptions,
		): Promise<SessionAuthenticationResult> {
			if (sealedSession === undefined || sealedSession.trim() === '') {
				return {
					authenticated: false,
					reason: 'no_session_cookie_provided',
				};
			}

			const session = workos.userManagement.loadSealedSession({
				sessionData: sealedSession,
				cookiePassword: config.cookiePassword,
			});

			const authResult = await session.authenticate();
			if (authResult.authenticated) {
				return {
					authenticated: true,
					user: toAuthUser(authResult.user),
					workosOrganizationId: authResult.organizationId ?? null,
					sessionId: authResult.sessionId,
					role: authResult.role ?? null,
				};
			}

			if (!options.mayRefresh) {
				return {
					authenticated: false,
					reason: SESSION_REFRESH_REQUIRED,
				};
			}

			const refreshResult = await session.refresh();
			if (refreshResult.authenticated) {
				const refreshedSession: AuthenticatedSession = {
					authenticated: true,
					user: toAuthUser(refreshResult.user),
					workosOrganizationId: refreshResult.organizationId ?? null,
					sessionId: refreshResult.sessionId,
					role: refreshResult.role ?? null,
				};

				if (refreshResult.sealedSession !== undefined) {
					return {
						...refreshedSession,
						sealedSession: refreshResult.sealedSession,
					};
				}

				return refreshedSession;
			}

			return {
				authenticated: false,
				reason: refreshResult.reason ?? authResult.reason ?? 'unauthenticated',
			};
		},

		/**
		 * Re-seal the session against a different organization the user belongs to.
		 *
		 * Organization selection already happens at sign-in, but only there — a
		 * session is bound to one organization for its whole life, and a user in
		 * more than one agency could otherwise only reach the second by signing out.
		 * WorkOS models the move as a refresh carrying an explicit organization, so
		 * the switch costs one round-trip and yields a session indistinguishable
		 * from one that had been signed into that organization directly.
		 *
		 * A refusal here is WorkOS's: the refresh fails when the user has no
		 * membership in the organization asked for. That is the authorization, not
		 * a check the caller is trusted to have done first.
		 */
		async switchOrganization(input: {
			readonly sealedSession: string | undefined;
			readonly workosOrganizationId: string;
		}): Promise<SessionAuthenticationResult> {
			if (input.sealedSession === undefined || input.sealedSession.trim() === '') {
				return { authenticated: false, reason: 'no_session_cookie_provided' };
			}

			const session = workos.userManagement.loadSealedSession({
				sessionData: input.sealedSession,
				cookiePassword: config.cookiePassword,
			});

			let refreshResult: Awaited<ReturnType<typeof session.refresh>>;
			try {
				refreshResult = await session.refresh({
					organizationId: input.workosOrganizationId,
				});
			} catch (error) {
				// The SDK returns a refusal for exactly three OAuth errors
				// (`invalid_grant`, `mfa_enrollment`, `sso_required`) and rethrows
				// everything else — and "not a member of that organization", the
				// refusal this endpoint exists to produce, is not one of the three. So
				// the ordinary case arrived here as a throw and left as a 500, and an
				// operator asking to enter an agency they have no membership in was
				// told "unable to switch" rather than what was wrong.
				const refusal = asSwitchRefusal(error);
				if (refusal === null) {
					throw error;
				}

				return refusal;
			}

			return toSwitchedSession(refreshResult);
		},

		async signInWithPassword(input: PasswordSignInInput): Promise<PasswordAuthResult> {
			try {
				const response = await workos.userManagement.authenticateWithPassword({
					clientId: config.clientId,
					email: input.email,
					password: input.password,
					...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
					...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
					session: sessionSealOptions,
				});

				return { status: 'authenticated', session: toAuthenticatedSession(response) };
			} catch (error) {
				return mapPasswordAuthFailure(error, input.email);
			}
		},

		async signUpWithPassword(input: PasswordSignUpInput): Promise<SignUpResult> {
			try {
				await workos.userManagement.createUser({
					email: input.email,
					password: input.password,
					...(input.firstName === undefined ? {} : { firstName: input.firstName }),
					...(input.lastName === undefined ? {} : { lastName: input.lastName }),
				});
			} catch (error) {
				if (isEmailTaken(error)) {
					return { status: 'email_taken' };
				}

				// WorkOS enforces the org's password policy (length, breached-password
				// detection) at user creation; surface it instead of a 500.
				//
				// `isPasswordRejection`, not `isUnprocessable`: `createUser` answers a
				// weak password with a **400** `password_strength_error` (#54), so
				// gating on 422 meant this arm never ran and a refused password
				// reached the caller as an unhandled throw.
				if (isPasswordRejection(error)) {
					return { status: 'weak_password', message: readErrorMessage(error) };
				}

				throw error;
			}

			// Signing in immediately either returns a session (verified-email orgs) or
			// surfaces `verification_required` so the client can collect the emailed code.
			return this.signInWithPassword(input);
		},

		async verifyEmailCode(input: {
			readonly code: string;
			readonly pendingAuthenticationToken: string;
			readonly ipAddress?: string;
			readonly userAgent?: string;
		}): Promise<VerifyEmailResult> {
			try {
				const response = await workos.userManagement.authenticateWithEmailVerification({
					clientId: config.clientId,
					code: input.code,
					pendingAuthenticationToken: input.pendingAuthenticationToken,
					...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
					...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
					session: sessionSealOptions,
				});

				return { status: 'authenticated', session: toAuthenticatedSession(response) };
			} catch (error) {
				// A multi-org user may still need to pick an organization after the
				// code checks out.
				const challenge = readAuthChallenge(error, '');
				if (challenge?.status === 'organization_selection_required') {
					return challenge;
				}

				if (isBadRequest(error) || isUnprocessable(error)) {
					return { status: 'invalid_code' };
				}

				throw error;
			}
		},

		async authenticateWithOrganizationSelection(input: {
			readonly organizationId: string;
			readonly pendingAuthenticationToken: string;
			readonly ipAddress?: string;
			readonly userAgent?: string;
		}): Promise<SelectOrganizationResult> {
			try {
				const response = await workos.userManagement.authenticateWithOrganizationSelection({
					clientId: config.clientId,
					organizationId: input.organizationId,
					pendingAuthenticationToken: input.pendingAuthenticationToken,
					...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
					...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
					session: sessionSealOptions,
				});

				return { status: 'authenticated', session: toAuthenticatedSession(response) };
			} catch (error) {
				if (isBadRequest(error) || isUnprocessable(error) || isNotFound(error)) {
					return { status: 'invalid_selection' };
				}

				throw error;
			}
		},

		/**
		 * Creates a WorkOS password reset and returns the opaque token. WorkOS does
		 * NOT email the reset link for this headless flow — the caller delivers it.
		 * Returns `null` when no user matches so callers can respond uniformly and
		 * avoid leaking account existence.
		 */
		async requestPasswordReset(input: {
			readonly email: string;
		}): Promise<{ readonly passwordResetToken: string; readonly email: string } | null> {
			try {
				const reset = await workos.userManagement.createPasswordReset({ email: input.email });
				return { passwordResetToken: reset.passwordResetToken, email: reset.email };
			} catch (error) {
				if (isNotFound(error) || isUnprocessable(error)) {
					return null;
				}

				throw error;
			}
		},

		async resetPassword(input: {
			readonly token: string;
			readonly newPassword: string;
		}): Promise<ResetPasswordResult> {
			try {
				await workos.userManagement.resetPassword({
					token: input.token,
					newPassword: input.newPassword,
				});
				return { status: 'ok' };
			} catch (error) {
				// A rejected password and a spent token both land here. Told apart,
				// because "this reset link is invalid or has expired" sends someone to
				// request another link when all they had to do was pick a different
				// password.
				if (isPasswordRejection(error)) {
					return { status: 'weak_password', message: readErrorMessage(error) };
				}

				if (isNotFound(error) || isUnprocessable(error) || isBadRequest(error)) {
					return { status: 'invalid_token' };
				}

				throw error;
			}
		},

		async getInvitationByToken(token: string): Promise<InvitationSummary | null> {
			try {
				const invitation = await workos.userManagement.findInvitationByToken(token);
				return {
					id: invitation.id,
					email: invitation.email,
					state: invitation.state,
					organizationId: invitation.organizationId,
				};
			} catch (error) {
				if (isNotFound(error)) {
					return null;
				}

				throw error;
			}
		},

		async acceptInvitationWithPassword(
			input: AcceptInvitationInput,
		): Promise<AcceptInvitationResult> {
			// WorkOS provisions a pending (passwordless, unverified) user for an
			// invited email when the invitation is sent, so by the time the invitee
			// accepts, an account for this email usually already exists. Creating a
			// new user in that case fails ("Could not create user" / email taken),
			// so instead set the password on the provisional account. Only fall back
			// to createUser when no account exists yet.
			//
			// `emailVerified: true` is what keeps acceptance a single step. The
			// invitation token was mailed to this address and the caller has already
			// matched it to a pending invitation for it, so holding the token proves
			// control of the mailbox — the same proof a verification code collects.
			// Left unverified, the authenticate call below answers
			// `email_verification_required` and mails a code the acceptance form has
			// no way to collect.
			const existingUser = await findUserByEmail(workos, input.email);
			if (existingUser !== null) {
				// A user who has already signed in owns a real account; they must sign
				// in to accept the invitation rather than set a new password here. A
				// never-signed-in account is the invitation's own provisional user.
				if (existingUser.lastSignInAt !== null) {
					return { status: 'account_exists' };
				}

				try {
					await workos.userManagement.updateUser({
						userId: existingUser.id,
						password: input.password,
						emailVerified: true,
						...(input.firstName === undefined ? {} : { firstName: input.firstName }),
						...(input.lastName === undefined ? {} : { lastName: input.lastName }),
					});
				} catch (error) {
					// Same policy check sign-up gets, and the same correction: `updateUser`
					// answers a weak password with a **400** `password_strength_error`
					// (#54), so the 422 this used to require never arrived and the
					// invitee got a generic failure with no way to tell that the password
					// was the problem.
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
						...(input.firstName === undefined ? {} : { firstName: input.firstName }),
						...(input.lastName === undefined ? {} : { lastName: input.lastName }),
					});
				} catch (error) {
					// The invitee already has a login; they must sign in to accept instead.
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
				// Passing the invitation token accepts the invite as part of the same
				// authentication, so the invitee lands in the organization directly.
				const response = await workos.userManagement.authenticateWithPassword({
					clientId: config.clientId,
					email: input.email,
					password: input.password,
					invitationToken: input.invitationToken,
					...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
					...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
					session: sessionSealOptions,
				});

				return { status: 'authenticated', session: toAuthenticatedSession(response) };
			} catch (error) {
				// The token was revoked, expired, or already spent between the lookup
				// and this call — an invitation problem, not a credential one.
				if (readErrorCode(error) === 'invitation_invalid') {
					return { status: 'invalid_invitation' };
				}

				// A challenge (verification, organization selection) is one more step,
				// not a failure. Hand it back so the caller can finish the flow
				// instead of dead-ending on an unhandled throw.
				return mapPasswordAuthFailure(error, input.email);
			}
		},

		async getLogoutUrl(sealedSession: string | undefined): Promise<string | null> {
			if (sealedSession === undefined || sealedSession.trim() === '') {
				return null;
			}

			const session = workos.userManagement.loadSealedSession({
				sessionData: sealedSession,
				cookiePassword: config.cookiePassword,
			});

			return session.getLogoutUrl();
		},

		/**
		 * Best-effort revocation of the WorkOS session behind a sealed cookie. Used
		 * on logout so a previously-captured sealed session can't be replayed after
		 * the cookie is cleared. Never throws — a failed revoke must not break the
		 * logout redirect.
		 */
		async revokeSession(sealedSession: string | undefined): Promise<void> {
			if (sealedSession === undefined || sealedSession.trim() === '') {
				return;
			}

			try {
				const session = workos.userManagement.loadSealedSession({
					sessionData: sealedSession,
					cookiePassword: config.cookiePassword,
				});

				const authResult = await session.authenticate();
				if (authResult.authenticated && authResult.sessionId) {
					await workos.userManagement.revokeSession({ sessionId: authResult.sessionId });
				}
			} catch {
				// Session already expired/invalid — clearing the cookie is enough.
			}
		},

		async getOrganization(workosOrganizationId: string | null): Promise<AuthOrganization | null> {
			if (workosOrganizationId === null) {
				return null;
			}

			const organization = await workos.organizations.getOrganization(workosOrganizationId);

			return {
				workosOrganizationId: organization.id,
				name: organization.name,
			};
		},

		async createOrganization(input: { readonly name: string }): Promise<AuthOrganization> {
			const organization = await workos.organizations.createOrganization({
				name: input.name,
				metadata: {
					source: 'simmer-operator',
				},
			});

			return {
				workosOrganizationId: organization.id,
				name: organization.name,
			};
		},

		/**
		 * End a user's membership in a WorkOS organization.
		 *
		 * The other half of ending a SIMMER membership, and the half that actually
		 * revokes anything: identity lives in WorkOS, so a session can still be
		 * refreshed into an organization the SIMMER row has marked `inactive`
		 * (`switchOrganization` above is exactly that refresh). Deactivated rather
		 * than deleted, to mirror what SIMMER does with its own row — the grant
		 * stops working, the record that it existed does not disappear, and
		 * reinstating somebody is a reactivation rather than a re-invitation.
		 *
		 * `not_a_member` is not a failure. The two systems can already disagree —
		 * a membership removed in the WorkOS dashboard leaves the SIMMER row
		 * standing — and running this against that state is how they are brought
		 * back together.
		 */
		async deactivateOrganizationMembership(input: {
			readonly workosUserId: string;
			readonly workosOrganizationId: string;
		}): Promise<{ readonly status: 'deactivated' | 'not_a_member' }> {
			const memberships = await workos.userManagement.listOrganizationMemberships({
				userId: input.workosUserId,
				organizationId: input.workosOrganizationId,
				limit: 1,
			});

			const membership = memberships.data[0];
			if (membership === undefined) {
				return { status: 'not_a_member' };
			}

			await workos.userManagement.deactivateOrganizationMembership(membership.id);
			return { status: 'deactivated' };
		},

		/**
		 * The WorkOS membership this email already holds in the organization.
		 *
		 * Asked before an invitation is sent, because `sendInvitation` refuses an
		 * address that is already a member and does so by throwing — so without
		 * this, the one case ADR 0011 makes routine (an operator who is already
		 * inside the agency's WorkOS organization, needing only the SIMMER role)
		 * is the one case the invitation route cannot serve.
		 *
		 * Two calls rather than one: WorkOS lists memberships by user id, and an
		 * invitation names an email.
		 */
		async findOrganizationMember(input: {
			readonly email: string;
			readonly workosOrganizationId: string;
		}): Promise<{
			readonly workosUserId: string;
			readonly status: 'active' | 'inactive' | 'pending';
		} | null> {
			const users = await workos.userManagement.listUsers({ email: input.email, limit: 1 });
			const user = users.data[0];
			if (user === undefined) {
				return null;
			}

			const memberships = await workos.userManagement.listOrganizationMemberships({
				userId: user.id,
				organizationId: input.workosOrganizationId,
				limit: 1,
			});

			const membership = memberships.data[0];
			if (membership === undefined) {
				return null;
			}

			return { workosUserId: user.id, status: membership.status };
		},

		async sendOrganizationInvitation(input: {
			readonly email: string;
			readonly workosOrganizationId: string;
			readonly inviterWorkosUserId?: string;
		}): Promise<AuthInvitation> {
			const invitation = await workos.userManagement.sendInvitation({
				email: input.email,
				organizationId: input.workosOrganizationId,
				...(input.inviterWorkosUserId === undefined
					? {}
					: { inviterUserId: input.inviterWorkosUserId }),
			});

			return {
				id: invitation.id,
				email: invitation.email,
				state: invitation.state,
				organizationId: invitation.organizationId,
				acceptedUserId: invitation.acceptedUserId,
				expiresAt: invitation.expiresAt,
				createdAt: invitation.createdAt,
				updatedAt: invitation.updatedAt,
			};
		},

		/**
		 * Kill an invitation link.
		 *
		 * `identity.reinvite` is the only caller, and it calls this before the send
		 * on purpose: WorkOS holds one invitation per address per organization and
		 * refuses a second while one is pending, so a re-invitation that sent first
		 * could not succeed at all (#218). `docs/identity-domain.md` states the
		 * ordering and what it costs.
		 *
		 * An invitation that is already accepted, expired or revoked answers
		 * `already_settled` rather than throwing. WorkOS refuses to revoke one, and
		 * so would a second run of the same re-invitation — which is a retry, not a
		 * failure. Anything else propagates: a revoke that failed for a reason
		 * nobody named leaves a live link, and that should be visible.
		 */
		async revokeInvitation(
			invitationId: string,
		): Promise<{ readonly status: 'revoked' | 'already_settled' }> {
			try {
				await workos.userManagement.revokeInvitation(invitationId);
				return { status: 'revoked' };
			} catch (error) {
				if (isSettledInvitationRefusal(error)) {
					return { status: 'already_settled' };
				}
				throw error;
			}
		},
	};
}

/**
 * Whether a revoke was refused because there was nothing left to revoke.
 *
 * WorkOS answers 404 for an invitation id it does not hold and 400 for one that
 * has already been accepted, expired or revoked. Both mean the link this call
 * exists to kill is not live, which is the state the caller wanted.
 */
function isSettledInvitationRefusal(error: unknown): boolean {
	const status = (error as { readonly status?: unknown } | null)?.status;
	return status === 400 || status === 404;
}

interface WorkOsClientLike {
	readonly userManagement: {
		readonly listUsers: (options: {
			readonly email: string;
			readonly limit?: number;
		}) => Promise<{ readonly data: readonly WorkOsListedUser[] }>;
	};
}

interface WorkOsListedUser {
	readonly id: string;
	readonly email: string;
	readonly lastSignInAt?: string | null;
}

/**
 * Looks up an existing WorkOS user by exact email. Returns `null` when none
 * matches. `lastSignInAt` distinguishes a real, previously-used account from an
 * invitation's provisional (never-signed-in) placeholder user.
 */
async function findUserByEmail(
	workos: WorkOsClientLike,
	email: string,
): Promise<{ readonly id: string; readonly lastSignInAt: string | null } | null> {
	const normalized = email.trim().toLowerCase();
	const result = await workos.userManagement.listUsers({ email: normalized, limit: 1 });
	const match = result.data.find((user) => user.email.trim().toLowerCase() === normalized);
	if (match === undefined) {
		return null;
	}

	return { id: match.id, lastSignInAt: match.lastSignInAt ?? null };
}

interface WorkOsAuthenticationResponseLike {
	readonly user: WorkOsUserLike;
	readonly organizationId?: string;
	readonly sealedSession?: string;
}

function toAuthenticatedSession(response: WorkOsAuthenticationResponseLike): AuthenticatedSession {
	if (response.sealedSession === undefined) {
		throw new Error('WorkOS did not return a sealed session.');
	}

	return {
		authenticated: true,
		user: toAuthUser(response.user),
		workosOrganizationId: response.organizationId ?? null,
		sessionId: null,
		role: null,
		sealedSession: response.sealedSession,
	};
}

/**
 * Maps a WorkOS password-authentication rejection onto the non-authenticated
 * variants of `PasswordAuthResult` (a further-step challenge or bad credentials).
 * Rethrows anything unrecognized so genuine faults are not silently swallowed.
 */
function mapPasswordAuthFailure(
	error: unknown,
	fallbackEmail: string,
): Exclude<PasswordAuthResult, { status: 'authenticated' }> {
	const challenge = readAuthChallenge(error, fallbackEmail);
	if (challenge !== null) {
		return challenge;
	}

	// Any non-challenge authentication rejection — wrong password, unknown user,
	// sso_required, unsupported MFA — is surfaced uniformly as invalid credentials.
	// We never leak which reason failed, and never let the error escape as a 500.
	if (
		isOauthException(error) ||
		readErrorCode(error) === 'invalid_credentials' ||
		errorStatus(error) === 401
	) {
		return { status: 'invalid_credentials' };
	}

	throw error;
}

/**
 * Detects a WorkOS "one more step" authentication challenge — email verification
 * or organization selection — from a rejected authenticate call. Returns `null`
 * when the error is not a recognized challenge.
 */
function readAuthChallenge(error: unknown, fallbackEmail: string): AuthChallenge | null {
	const raw = readRawData(error);
	if (raw === undefined) {
		return null;
	}

	const code = readErrorCode(error);
	const token = raw.pending_authentication_token;
	if (typeof token !== 'string') {
		return null;
	}

	if (code === 'email_verification_required') {
		const email = typeof raw.email === 'string' ? raw.email : fallbackEmail;
		return { status: 'verification_required', pendingAuthenticationToken: token, email };
	}

	if (code === 'organization_selection_required') {
		return {
			status: 'organization_selection_required',
			pendingAuthenticationToken: token,
			organizations: readOrganizationChoices(raw.organizations),
		};
	}

	return null;
}

function readOrganizationChoices(value: unknown): readonly AuthOrganizationChoice[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const choices: AuthOrganizationChoice[] = [];
	for (const entry of value) {
		if (typeof entry === 'object' && entry !== null) {
			const id = (entry as { id?: unknown }).id;
			const name = (entry as { name?: unknown }).name;
			if (typeof id === 'string') {
				choices.push({ id, name: typeof name === 'string' ? name : id });
			}
		}
	}

	return choices;
}

function readRawData(error: unknown): Record<string, unknown> | undefined {
	if (typeof error === 'object' && error !== null && 'rawData' in error) {
		const raw = (error as { readonly rawData: unknown }).rawData;
		if (typeof raw === 'object' && raw !== null) {
			return raw as Record<string, unknown>;
		}
	}

	return undefined;
}

function readErrorCode(error: unknown): string | undefined {
	if (typeof error === 'object' && error !== null) {
		const code = (error as { readonly code?: unknown }).code;
		if (typeof code === 'string') {
			return code;
		}

		const raw = readRawData(error);
		if (raw !== undefined) {
			// Most WorkOS exceptions expose the machine code as `code`, but the
			// OAuth-style `OauthException` (thrown by authenticateWith*) carries it
			// in `error` alongside `error_description`. Check both.
			if (typeof raw.code === 'string') {
				return raw.code;
			}
			if (typeof raw.error === 'string') {
				return raw.error;
			}
		}
	}

	return undefined;
}

/** WorkOS OAuth-style authentication rejection (wrong password, sso_required, mfa, …). */
function isOauthException(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		(error as { readonly name?: unknown }).name === 'OauthException'
	);
}

function errorStatus(error: unknown): number | undefined {
	if (typeof error === 'object' && error !== null) {
		const status = (error as { readonly status?: unknown }).status;
		if (typeof status === 'number') {
			return status;
		}
	}

	return undefined;
}

function errorName(error: unknown): string | undefined {
	if (error instanceof Error) {
		return error.name;
	}

	return undefined;
}

function isNotFound(error: unknown): boolean {
	return errorName(error) === 'NotFoundException' || errorStatus(error) === 404;
}

function isUnprocessable(error: unknown): boolean {
	return errorName(error) === 'UnprocessableEntityException' || errorStatus(error) === 422;
}

function isBadRequest(error: unknown): boolean {
	return errorName(error) === 'BadRequestException' || errorStatus(error) === 400;
}

function isEmailTaken(error: unknown): boolean {
	const code = readErrorCode(error);
	return code === 'email_not_available' || code === 'email_taken';
}

/**
 * WorkOS's codes for a password refused by the organization's policy.
 *
 * Observed against a live environment rather than inferred (#54, probe in
 * `probe-reset-password.ts`). Both arrive as **400** `BadRequestException`:
 *
 * - `password_reset_error` — `resetPassword`, message "Could not reset password."
 * - `password_strength_error` — `createUser` and `updateUser`, message
 *   "Password does not meet strength requirements."
 *
 * The earlier guesses were `password_strength_error` (right, but not on the
 * reset path), `password_validation_error`, and `weak_password` (neither
 * observed anywhere).
 */
const PASSWORD_POLICY_CODES = new Set(['password_reset_error', 'password_strength_error']);

/**
 * Whether WorkOS refused a password on policy grounds.
 *
 * The status is what settles it, and it is not what this function used to
 * assume. A refused password is a **400**; a spent, malformed, or unknown reset
 * token is a **404** with `password_reset_token_not_found`. Nothing observed
 * was a 422 at all — so gating on 422, as this did, made the function answer
 * `false` for every real policy rejection and told a user who had picked a
 * short password that their link had expired.
 *
 * 422 is still accepted because it costs nothing and WorkOS is free to change;
 * 404 is still excluded, because that is the token's status and a token failure
 * must never read as a password one.
 */
function isPasswordRejection(error: unknown): boolean {
	if (isNotFound(error)) {
		return false;
	}
	if (!isBadRequest(error) && !isUnprocessable(error)) {
		return false;
	}

	const code = (readErrorCode(error) ?? '').toLowerCase();
	if (code.includes('token')) {
		return false;
	}
	// The observed codes, or — as a narrow fallback — a per-requirement code from
	// `errors[]`, which is WorkOS's own data rather than a guess about wording.
	// The message-substring test this replaces was the fragile half: none of the
	// observed messages mention "password" in a way worth matching on.
	return PASSWORD_POLICY_CODES.has(code) || readPasswordIssueCodes(error).length > 0;
}

/**
 * The per-requirement codes on a refused password: `password_too_short`,
 * `password_too_weak`.
 */
function readPasswordIssueCodes(error: unknown): readonly string[] {
	return readErrorEntries(error)
		.map((entry) => (typeof entry.code === 'string' ? entry.code : ''))
		.filter((code) => code.startsWith('password_'));
}

function readErrorEntries(error: unknown): readonly Record<string, unknown>[] {
	const entries = (error as { readonly errors?: unknown } | null)?.errors;
	if (!Array.isArray(entries)) {
		return [];
	}
	return entries.filter(
		(entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null,
	);
}

/**
 * What to show someone whose password was refused.
 *
 * The top-level message is no help — "Could not reset password." is what WorkOS
 * says when the password was too short, which tells the user nothing they can
 * act on. The actionable text is in `errors[]`: "The provided password does not
 * meet the minimum length requirements. Please try a password with 10 or more
 * characters."
 */
function readErrorMessage(error: unknown): string {
	const issues = readErrorEntries(error)
		.map((entry) => (typeof entry.message === 'string' ? entry.message.trim() : ''))
		.filter((message) => message !== '');
	if (issues.length > 0) {
		return issues.join(' ');
	}

	if (error instanceof Error && error.message.trim() !== '') {
		return error.message;
	}

	return 'Password does not meet the requirements.';
}

/**
 * A completed refresh, read as a session.
 *
 * The sealed cookie is the part that matters: the caller has to re-set it or
 * the switch lasts exactly one request.
 */
function toSwitchedSession(
	refreshResult: Awaited<
		ReturnType<ReturnType<WorkOS['userManagement']['loadSealedSession']>['refresh']>
	>,
): SessionAuthenticationResult {
	if (!refreshResult.authenticated) {
		return {
			authenticated: false,
			reason: refreshResult.reason ?? 'organization_switch_refused',
		};
	}

	const switched: AuthenticatedSession = {
		authenticated: true,
		user: toAuthUser(refreshResult.user),
		workosOrganizationId: refreshResult.organizationId ?? null,
		sessionId: refreshResult.sessionId,
		role: refreshResult.role ?? null,
	};

	return refreshResult.sealedSession === undefined
		? switched
		: { ...switched, sealedSession: refreshResult.sealedSession };
}

/**
 * Whether a thrown WorkOS error is that organization saying no.
 *
 * WorkOS answers a refused refresh with a 4xx, and its exceptions carry the
 * status — `OauthException` also names the reason in `error`. Reading the
 * status is what separates "asked, and was told no" from "could not ask": a
 * timeout, a 5xx, or a rate limit is not a membership decision, and returning
 * one as a refusal would tell an operator they lack access they may well have.
 * Those are rethrown, so they surface as the failures they are. 429 sits on the
 * wrong side of the line for this purpose — it means ask again, not no.
 */
function asSwitchRefusal(error: unknown): UnauthenticatedSession | null {
	const failure = error as { readonly status?: unknown; readonly error?: unknown } | null;
	const status = typeof failure?.status === 'number' ? failure.status : 0;
	if (status < 400 || status >= 500 || status === 429) {
		return null;
	}

	const code = failure?.error;
	return {
		authenticated: false,
		reason: typeof code === 'string' && code.trim() !== '' ? code : 'organization_switch_refused',
	};
}

function toAuthUser(user: WorkOsUserLike): AuthUser {
	const firstName = user.firstName ?? null;
	const lastName = user.lastName ?? null;
	const displayName = [firstName, lastName].filter(Boolean).join(' ').trim();

	return {
		workosUserId: user.id,
		email: user.email,
		firstName,
		lastName,
		displayName: displayName === '' ? user.email : displayName,
		emailVerified: user.emailVerified ?? null,
		profilePictureUrl: user.profilePictureUrl ?? null,
	};
}
