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
				if (isUnprocessable(error)) {
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
					// Same policy check sign-up gets: WorkOS enforces length and
					// breached-password detection here, and an unmapped rejection would
					// reach the invitee as a generic failure with no way to tell that the
					// password was the problem.
					if (isUnprocessable(error)) {
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
	};
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
 * Whether WorkOS refused a password on policy grounds.
 *
 * Only used where 422 is ambiguous — password reset, where the same status can
 * mean a spent token. Matches on the code or message rather than the status
 * alone so an unrelated 422 keeps its existing meaning.
 */
function isPasswordRejection(error: unknown): boolean {
	if (!isUnprocessable(error)) {
		return false;
	}
	const code = readErrorCode(error) ?? '';
	if (code.includes('password')) {
		return true;
	}
	return error instanceof Error && error.message.toLowerCase().includes('password');
}

function readErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim() !== '') {
		return error.message;
	}

	return 'Password does not meet the requirements.';
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
