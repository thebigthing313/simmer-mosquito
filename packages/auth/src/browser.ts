/**
 * The browser half of SIMMER's authentication contract.
 *
 * `packages/auth` (the package root) is the server's WorkOS boundary. This entry
 * point is its counterpart in the other direction: the typed client for the
 * public `POST /auth/*` endpoints that boundary sits behind, plus the shape of
 * `/auth/me`. It imports nothing from `@workos-inc/node` and is exported as a
 * separate subpath so a browser bundle never reaches the server SDK.
 *
 * Both front ends need it. The agency workspace signs agency staff in; the
 * operator console signs operators in against the same endpoints (`/auth/*` CORS
 * already admits `ADMIN_APP_ORIGIN`). Written twice, the two copies of the
 * outcome parsing drifted immediately — an outcome the server can return but one
 * client does not name is a silent dead end for the user in front of it.
 *
 * The server URL is injected rather than read from `import.meta.env` here: this
 * module is environment-agnostic, and each app already owns that decision (web
 * additionally distinguishes a shape-server origin).
 */

export interface AuthUser {
	readonly workosUserId: string;
	readonly email: string;
	readonly firstName: string | null;
	readonly lastName: string | null;
	readonly displayName: string;
	readonly emailVerified: boolean | null;
	readonly profilePictureUrl: string | null;
}

export interface LocalIdentity {
	readonly userId: string;
	readonly organizationId: string | null;
	readonly organizationName?: string;
	readonly organizationSlug?: string | null;
	readonly profileId: string | null;
	readonly membershipId: string | null;
	readonly role: string | null;
}

export interface AuthenticatedMe {
	readonly authenticated: true;
	readonly user: AuthUser;
	readonly workosOrganizationId: string | null;
	readonly localIdentity: LocalIdentity;
}

export interface UnauthenticatedMe {
	readonly authenticated: false;
	readonly reason: string;
}

export type AuthMe = AuthenticatedMe | UnauthenticatedMe;

// --- In-app (bring-your-own-UI) email + password auth flows ---

export interface AuthenticatedOutcome {
	readonly status: 'authenticated';
	readonly organizationRequired: boolean;
}

export interface VerificationRequiredOutcome {
	readonly status: 'verification_required';
	readonly pendingAuthenticationToken: string;
	readonly email: string;
}

/**
 * The result of moving a live session to another organization.
 *
 * `refused` is its own outcome rather than an error because it is the expected
 * answer, not a fault: the membership check is WorkOS's, and "you are not in
 * that agency" is exactly what the caller needs to show.
 */
export type SwitchOrganizationOutcome =
	| { readonly status: 'switched' }
	| { readonly status: 'refused'; readonly reason: string }
	| { readonly status: 'error'; readonly reason: string };

export interface AuthOrganizationChoice {
	readonly id: string;
	readonly name: string;
}

export interface OrganizationSelectionRequiredOutcome {
	readonly status: 'organization_selection_required';
	readonly pendingAuthenticationToken: string;
	readonly organizations: readonly AuthOrganizationChoice[];
}

export interface AuthErrorOutcome {
	readonly status: 'error';
	readonly reason: string;
}

export type SignInOutcome =
	| AuthenticatedOutcome
	| VerificationRequiredOutcome
	| OrganizationSelectionRequiredOutcome
	| { readonly status: 'invalid_credentials' }
	| AuthErrorOutcome;

export type SignUpOutcome =
	| AuthenticatedOutcome
	| VerificationRequiredOutcome
	| OrganizationSelectionRequiredOutcome
	| { readonly status: 'email_taken' }
	| { readonly status: 'weak_password'; readonly reason: string }
	| AuthErrorOutcome;

export type VerifyEmailOutcome =
	| AuthenticatedOutcome
	| OrganizationSelectionRequiredOutcome
	| { readonly status: 'invalid_code' }
	| AuthErrorOutcome;

export type SelectOrganizationOutcome =
	| AuthenticatedOutcome
	| { readonly status: 'invalid_selection' }
	| AuthErrorOutcome;

export type ResetPasswordOutcome =
	| { readonly status: 'ok' }
	| { readonly status: 'invalid_token' }
	| { readonly status: 'weak_password'; readonly reason: string }
	| AuthErrorOutcome;

export type AcceptInvitationOutcome =
	| AuthenticatedOutcome
	| VerificationRequiredOutcome
	| OrganizationSelectionRequiredOutcome
	| { readonly status: 'account_exists' }
	| { readonly status: 'invalid_invitation' }
	| { readonly status: 'weak_password'; readonly reason: string }
	| AuthErrorOutcome;

export interface InvitationLookup {
	readonly email: string;
	readonly state: 'pending' | 'accepted' | 'expired' | 'revoked';
}

/** Everything the client can do, bound to one server origin. */
export interface AuthClient {
	readonly getAuthMe: () => Promise<AuthMe>;
	readonly signIn: (input: {
		readonly email: string;
		readonly password: string;
	}) => Promise<SignInOutcome>;
	readonly signUp: (input: {
		readonly email: string;
		readonly password: string;
		readonly firstName?: string;
		readonly lastName?: string;
	}) => Promise<SignUpOutcome>;
	readonly verifyEmail: (input: {
		readonly code: string;
		readonly pendingAuthenticationToken: string;
	}) => Promise<VerifyEmailOutcome>;
	readonly selectOrganization: (input: {
		readonly organizationId: string;
		readonly pendingAuthenticationToken: string;
	}) => Promise<SelectOrganizationOutcome>;
	readonly switchOrganization: (input: {
		readonly organizationId: string;
	}) => Promise<SwitchOrganizationOutcome>;
	readonly requestPasswordReset: (input: { readonly email: string }) => Promise<void>;
	readonly resetPassword: (input: {
		readonly token: string;
		readonly newPassword: string;
	}) => Promise<ResetPasswordOutcome>;
	readonly fetchInvitation: (token: string) => Promise<InvitationLookup | null>;
	readonly acceptInvitation: (input: {
		readonly invitationToken: string;
		readonly password: string;
		readonly firstName?: string;
		readonly lastName?: string;
	}) => Promise<AcceptInvitationOutcome>;
}

export function createAuthClient(options: { readonly serverUrl: string }): AuthClient {
	const { serverUrl } = options;

	/**
	 * The current session. A 401 body still carries `authenticated: false`, which
	 * is an answer rather than a failure — only an unreadable response throws.
	 */
	async function getAuthMe(): Promise<AuthMe> {
		const response = await fetch(`${serverUrl}/auth/me`, {
			credentials: 'include',
			headers: { accept: 'application/json' },
		});

		const body = (await response.json()) as AuthMe;
		if (response.ok || body.authenticated === false) {
			return body;
		}

		throw new Error('Unable to load auth state.');
	}

	async function signIn(input: {
		readonly email: string;
		readonly password: string;
	}): Promise<SignInOutcome> {
		const { data } = await postAuthJson('/auth/sign-in', input);
		if (data.ok === true) {
			return authenticatedOutcome(data);
		}

		if (data.status === 'verification_required') {
			return verificationOutcome(data);
		}

		if (data.status === 'organization_selection_required') {
			return organizationSelectionOutcome(data);
		}

		if (data.status === 'invalid_credentials') {
			return { status: 'invalid_credentials' };
		}

		return { status: 'error', reason: readReason(data, 'Unable to sign in.') };
	}

	async function signUp(input: {
		readonly email: string;
		readonly password: string;
		readonly firstName?: string;
		readonly lastName?: string;
	}): Promise<SignUpOutcome> {
		const { data } = await postAuthJson('/auth/sign-up', input);
		if (data.ok === true) {
			return authenticatedOutcome(data);
		}

		if (data.status === 'verification_required') {
			return verificationOutcome(data);
		}

		if (data.status === 'organization_selection_required') {
			return organizationSelectionOutcome(data);
		}

		if (data.status === 'email_taken') {
			return { status: 'email_taken' };
		}

		if (data.status === 'weak_password') {
			return { status: 'weak_password', reason: readReason(data, 'Choose a stronger password.') };
		}

		return { status: 'error', reason: readReason(data, 'Unable to create your account.') };
	}

	async function verifyEmail(input: {
		readonly code: string;
		readonly pendingAuthenticationToken: string;
	}): Promise<VerifyEmailOutcome> {
		const { data } = await postAuthJson('/auth/verify-email', input);
		if (data.ok === true) {
			return authenticatedOutcome(data);
		}

		if (data.status === 'organization_selection_required') {
			return organizationSelectionOutcome(data);
		}

		if (data.status === 'invalid_code') {
			return { status: 'invalid_code' };
		}

		return { status: 'error', reason: readReason(data, 'Unable to verify the code.') };
	}

	async function selectOrganization(input: {
		readonly organizationId: string;
		readonly pendingAuthenticationToken: string;
	}): Promise<SelectOrganizationOutcome> {
		const { data } = await postAuthJson('/auth/select-organization', input);
		if (data.ok === true) {
			return authenticatedOutcome(data);
		}

		if (data.status === 'invalid_selection') {
			return { status: 'invalid_selection' };
		}

		return { status: 'error', reason: readReason(data, 'Unable to select organization.') };
	}

	/**
	 * Move an already-good session into another organization the user belongs to.
	 *
	 * Not the same thing as {@link selectOrganization}, which resolves a sign-in
	 * that has not finished yet. This one has nothing pending: the caller is
	 * signed in and wants to be somewhere else, which is how a SIMMER Operator
	 * holding an agency membership comes to hold an ordinary agency session
	 * (ADR 0011).
	 */
	async function switchOrganization(input: {
		readonly organizationId: string;
	}): Promise<SwitchOrganizationOutcome> {
		const { data } = await postAuthJson('/auth/switch-organization', input);
		if (data.ok === true) {
			return { status: 'switched' };
		}

		if (data.status === 'organization_switch_refused') {
			return { status: 'refused', reason: readReason(data, 'That organization is not available.') };
		}

		return { status: 'error', reason: readReason(data, 'Unable to switch organization.') };
	}

	async function requestPasswordReset(input: { readonly email: string }): Promise<void> {
		// The server always answers 200 to avoid leaking which emails are registered.
		await postAuthJson('/auth/forgot-password', input);
	}

	async function resetPassword(input: {
		readonly token: string;
		readonly newPassword: string;
	}): Promise<ResetPasswordOutcome> {
		const { data } = await postAuthJson('/auth/reset-password', input);
		if (data.ok === true) {
			return { status: 'ok' };
		}

		if (data.status === 'weak_password') {
			return { status: 'weak_password', reason: readReason(data, 'Choose a stronger password.') };
		}

		if (data.status === 'invalid_token') {
			return { status: 'invalid_token' };
		}

		return { status: 'error', reason: readReason(data, 'Unable to reset your password.') };
	}

	async function fetchInvitation(
		token: string,
		targetUrl = serverUrl,
	): Promise<InvitationLookup | null> {
		const response = await fetch(
			`${targetUrl}/auth/invitation?token=${encodeURIComponent(token)}`,
			{
				credentials: 'include',
				headers: { accept: 'application/json' },
			},
		);
		const data = (await response.json().catch(() => ({}))) as {
			readonly invitation?: InvitationLookup | null;
		};
		return data.invitation ?? null;
	}

	async function acceptInvitation(input: {
		readonly invitationToken: string;
		readonly password: string;
		readonly firstName?: string;
		readonly lastName?: string;
	}): Promise<AcceptInvitationOutcome> {
		const { data } = await postAuthJson('/auth/accept-invitation', input);
		if (data.ok === true) {
			return authenticatedOutcome(data);
		}

		if (data.status === 'verification_required') {
			return verificationOutcome(data);
		}

		if (data.status === 'organization_selection_required') {
			return organizationSelectionOutcome(data);
		}

		if (data.status === 'account_exists') {
			return { status: 'account_exists' };
		}

		if (data.status === 'invalid_invitation') {
			return { status: 'invalid_invitation' };
		}

		if (data.status === 'weak_password') {
			return { status: 'weak_password', reason: readReason(data, 'Choose a stronger password.') };
		}

		return { status: 'error', reason: readReason(data, 'Unable to accept the invitation.') };
	}

	async function postAuthJson(
		path: string,
		body: unknown,
	): Promise<{ readonly httpOk: boolean; readonly data: Record<string, unknown> }> {
		const response = await fetch(`${serverUrl}${path}`, {
			method: 'POST',
			credentials: 'include',
			headers: {
				accept: 'application/json',
				'content-type': 'application/json',
			},
			body: JSON.stringify(body),
		});

		const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
		return { httpOk: response.ok, data };
	}

	function authenticatedOutcome(data: Record<string, unknown>): AuthenticatedOutcome {
		return { status: 'authenticated', organizationRequired: data.organizationRequired === true };
	}

	function verificationOutcome(data: Record<string, unknown>): VerificationRequiredOutcome {
		return {
			status: 'verification_required',
			pendingAuthenticationToken:
				typeof data.pendingAuthenticationToken === 'string' ? data.pendingAuthenticationToken : '',
			email: typeof data.email === 'string' ? data.email : '',
		};
	}

	function organizationSelectionOutcome(
		data: Record<string, unknown>,
	): OrganizationSelectionRequiredOutcome {
		const organizations = Array.isArray(data.organizations)
			? data.organizations.flatMap((entry): AuthOrganizationChoice[] =>
					typeof entry === 'object' &&
					entry !== null &&
					typeof (entry as { id?: unknown }).id === 'string'
						? [
								{
									id: (entry as { id: string }).id,
									name:
										typeof (entry as { name?: unknown }).name === 'string'
											? (entry as { name: string }).name
											: (entry as { id: string }).id,
								},
							]
						: [],
				)
			: [];

		return {
			status: 'organization_selection_required',
			pendingAuthenticationToken:
				typeof data.pendingAuthenticationToken === 'string' ? data.pendingAuthenticationToken : '',
			organizations,
		};
	}

	function readReason(data: Record<string, unknown>, fallback: string): string {
		return typeof data.reason === 'string' && data.reason.trim() !== '' ? data.reason : fallback;
	}

	return {
		acceptInvitation,
		fetchInvitation,
		getAuthMe,
		requestPasswordReset,
		resetPassword,
		selectOrganization,
		signIn,
		signUp,
		switchOrganization,
		verifyEmail,
	};
}

// --- The session, cached for the page ---

/**
 * The signed-in session as one value the router and the shell both read.
 *
 * `/auth/me` is a network round trip, route `beforeLoad` guards run before any
 * component does, and several of them run per navigation. A shared snapshot with
 * a single in-flight promise means the session is fetched once, not once per
 * guard.
 */
export interface AppAuthController {
	readonly snapshot: AuthMe | null;
	readonly load: () => Promise<AuthMe>;
	readonly refresh: () => Promise<AuthMe>;
	readonly subscribe: (listener: () => void) => () => void;
}

/**
 * Build the controller over one app's `/auth/me`.
 *
 * A factory rather than a module-level singleton because the two front ends
 * reach the endpoint through their own clients — but each app calls this once at
 * module scope, so the singleton the guards depend on is still exactly one.
 */
export function createAppAuthController(options: {
	readonly getAuthMe: () => Promise<AuthMe>;
}): AppAuthController {
	const { getAuthMe } = options;

	let snapshot: AuthMe | null = null;
	let pending: Promise<AuthMe> | null = null;
	const listeners = new Set<() => void>();

	function load(): Promise<AuthMe> {
		if (snapshot !== null) {
			return Promise.resolve(snapshot);
		}

		if (pending === null) {
			pending = refresh();
		}

		return pending;
	}

	async function refresh(): Promise<AuthMe> {
		try {
			const answer = await getAuthMe();
			snapshot = answer;
			return answer;
		} catch (error) {
			/*
			 * Could not ask, which is not the same as being told no.
			 *
			 * `getAuthMe` already draws that line — a 401 carries
			 * `authenticated: false` and is returned, and only an unreadable response
			 * throws — so reaching here means the round trip broke, not that the
			 * session did. Caching a refusal for it *latched*: `load()` short-circuits
			 * on any non-null snapshot, so one failed request signed the user out for
			 * the life of the page while every later `/auth/me` answered 200 and went
			 * unread.
			 *
			 * So leave the snapshot alone. A known session survives a blip and the
			 * next guard retries; with nothing known yet, answer "no" for this caller
			 * without recording it.
			 */
			return (
				snapshot ?? {
					authenticated: false,
					reason: error instanceof Error ? error.message : 'Unable to load auth state.',
				}
			);
		} finally {
			pending = null;
			emit();
		}
	}

	function emit(): void {
		for (const listener of listeners) {
			listener();
		}
	}

	return {
		get snapshot() {
			return snapshot;
		},
		load,
		refresh,
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}
