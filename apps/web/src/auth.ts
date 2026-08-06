const DEFAULT_SERVER_URL = 'http://localhost:3000';

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

export type SimmerRole = 'owner' | 'admin' | 'manager' | 'collector' | 'viewer';
export type MembershipStatus = 'active' | 'inactive' | 'invited';

export interface AdminMembership {
	readonly id: string;
	readonly organizationId: string;
	readonly userId: string | null;
	readonly profileId: string;
	readonly role: SimmerRole;
	readonly status: MembershipStatus;
	readonly isDefault: boolean;
	readonly invitedEmail: string | null;
	readonly workosInvitationId: string | null;
	readonly profile: {
		readonly displayName: string;
		readonly email: string | null;
		readonly isActive: boolean;
	};
	readonly createdAt: string;
	readonly updatedAt: string;
}

export function getServerUrl(): string {
	return trimTrailingSlash(import.meta.env.VITE_SERVER_URL ?? DEFAULT_SERVER_URL);
}

export function getShapeServerUrl(): string {
	return trimTrailingSlash(
		import.meta.env.VITE_SHAPE_SERVER_URL ?? import.meta.env.VITE_SERVER_URL ?? DEFAULT_SERVER_URL,
	);
}

export async function getAuthMe(serverUrl = getServerUrl()): Promise<AuthMe> {
	const response = await fetch(`${serverUrl}/auth/me`, {
		credentials: 'include',
		headers: {
			accept: 'application/json',
		},
	});

	const body = (await response.json()) as AuthMe;
	if (response.ok || body.authenticated === false) {
		return body;
	}

	throw new Error('Unable to load auth state.');
}

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

export async function signIn(input: {
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

export async function signUp(input: {
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

export async function verifyEmail(input: {
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

export async function selectOrganization(input: {
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

export async function requestPasswordReset(input: { readonly email: string }): Promise<void> {
	// The server always answers 200 to avoid leaking which emails are registered.
	await postAuthJson('/auth/forgot-password', input);
}

export async function resetPassword(input: {
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

export async function fetchInvitation(
	token: string,
	serverUrl = getServerUrl(),
): Promise<InvitationLookup | null> {
	const response = await fetch(`${serverUrl}/auth/invitation?token=${encodeURIComponent(token)}`, {
		credentials: 'include',
		headers: { accept: 'application/json' },
	});
	const data = (await response.json().catch(() => ({}))) as {
		readonly invitation?: InvitationLookup | null;
	};
	return data.invitation ?? null;
}

export async function acceptInvitation(input: {
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
	const response = await fetch(`${getServerUrl()}${path}`, {
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

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, '');
}
