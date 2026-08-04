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

export interface AdminOrganization {
	readonly id: string;
	readonly workosOrganizationId: string | null;
	readonly name: string;
	readonly slug: string | null;
	readonly subscription: {
		readonly subscriptionStatus: 'trial' | 'active' | 'suspended' | 'canceled';
		readonly billingMode: 'manual_invoice';
		readonly billingContactName: string | null;
		readonly billingContactEmail: string | null;
		readonly subscriptionNotes: string | null;
	};
	readonly contact: {
		readonly mainContactEmail: string | null;
		readonly phoneNumber: string | null;
		readonly mailingCountry: string | null;
		readonly mailingAddressLine1: string | null;
		readonly mailingAddressLine2: string | null;
		readonly mailingLocality: string | null;
		readonly mailingRegion: string | null;
		readonly mailingPostalCode: string | null;
	};
	readonly ownerLinked: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
}

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

export interface AdminGeometry {
	readonly lat: number;
	readonly lng: number;
	readonly geojson: unknown;
	readonly geomType: string;
}

export interface AdminAddress {
	readonly id: string;
	readonly organizationId: string;
	readonly geometry: AdminGeometry;
	readonly displayName: string;
	readonly country: string;
	readonly addressLine1: string | null;
	readonly addressLine2: string | null;
	readonly locality: string | null;
	readonly region: string | null;
	readonly postalCode: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface AdminRegionFolder {
	readonly id: string;
	readonly organizationId: string;
	readonly name: string;
	readonly description: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface AdminRegion {
	readonly id: string;
	readonly organizationId: string;
	readonly regionFolderId: string | null;
	readonly geometry: AdminGeometry;
	readonly name: string;
	readonly description: string | null;
	readonly metadata: unknown | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface AdminGenus {
	readonly id: string;
	readonly abbreviation: string;
	readonly name: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface AdminSpecies {
	readonly id: string;
	readonly genusId: string | null;
	readonly epithet: string;
	readonly commonName: string | null;
	readonly displayName: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface AdminOrganizationSpecies {
	readonly id: string;
	readonly organizationId: string;
	readonly speciesId: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface AdminLookup {
	readonly id: string;
	readonly organizationId: string;
	readonly name: string;
	readonly description: string | null;
	readonly customSchema: unknown | null;
	readonly actionThreshold: number | null;
	readonly isActive: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export type AdminLookupKind = 'collection_methods' | 'collection_lures' | 'habitat_types';

export interface AdminTrap {
	readonly id: string;
	readonly organizationId: string;
	readonly geometry: AdminGeometry;
	readonly collectionMethodId: string;
	readonly addressId: string | null;
	readonly collectionLureId: string | null;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	readonly description: string | null;
	readonly isActive: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface AdminFoundations {
	readonly addresses: AdminAddress[];
	readonly regionFolders: AdminRegionFolder[];
	readonly regions: AdminRegion[];
	readonly genera: AdminGenus[];
	readonly species: AdminSpecies[];
	readonly organizationSpecies: AdminOrganizationSpecies[];
	readonly lookups: {
		readonly collectionMethods: AdminLookup[];
		readonly collectionLures: AdminLookup[];
		readonly habitatTypes: AdminLookup[];
	};
	readonly traps: AdminTrap[];
}

export interface OrganizationMembershipsResult {
	readonly organization: AdminOrganization;
	readonly memberships: AdminMembership[];
}

export interface CreateAdminOrganizationInput {
	readonly name: string;
	readonly subscriptionStatus: 'trial' | 'active' | 'suspended' | 'canceled';
	readonly billingContactName: string;
	readonly billingContactEmail: string;
	readonly subscriptionNotes: string;
	readonly mainContactEmail: string;
	readonly phoneNumber: string;
	readonly mailingCountry: string;
	readonly mailingAddressLine1: string;
	readonly mailingAddressLine2: string;
	readonly mailingLocality: string;
	readonly mailingRegion: string;
	readonly mailingPostalCode: string;
	readonly linkRequesterAsOwner: boolean;
}

export interface InviteAdminUserInput {
	readonly email: string;
	readonly displayName: string;
	readonly role: SimmerRole;
}

export interface CreateAddressInput {
	readonly displayName: string;
	readonly country: string;
	readonly addressLine1: string;
	readonly addressLine2: string;
	readonly locality: string;
	readonly region: string;
	readonly postalCode: string;
	readonly geojson: unknown;
}

export interface CreateRegionFolderInput {
	readonly name: string;
	readonly description: string;
}

export interface CreateRegionInput {
	readonly name: string;
	readonly regionFolderId: string;
	readonly description: string;
	readonly metadata: unknown;
	readonly geojson: unknown;
}

export interface CreateGenusInput {
	readonly abbreviation: string;
	readonly name: string;
}

export interface CreateSpeciesInput {
	readonly genusId: string;
	readonly epithet: string;
	readonly commonName: string;
	readonly displayName: string;
}

export interface EnableOrganizationSpeciesInput {
	readonly speciesId: string;
}

export interface CreateLookupInput {
	readonly name: string;
	readonly description: string;
	readonly customSchema: unknown;
	readonly actionThreshold: number | null;
	readonly isActive: boolean;
}

export interface CreateTrapInput {
	readonly collectionMethodId: string;
	readonly addressId: string;
	readonly collectionLureId: string;
	readonly trapName: string;
	readonly trapCode: string;
	readonly description: string;
	readonly isActive: boolean;
	readonly geojson: unknown;
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

export async function listAdminOrganizations(
	serverUrl = getServerUrl(),
): Promise<AdminOrganization[]> {
	const response = await fetch(`${serverUrl}/admin/organizations`, {
		credentials: 'include',
		headers: {
			accept: 'application/json',
		},
	});

	const body = (await response.json()) as
		| { readonly organizations: AdminOrganization[] }
		| { readonly error: string };

	if (!response.ok || !('organizations' in body)) {
		throw new Error('Unable to load admin organizations.');
	}

	return body.organizations;
}

export async function createAdminOrganization(
	input: CreateAdminOrganizationInput,
	serverUrl = getServerUrl(),
): Promise<AdminOrganization> {
	const response = await fetch(`${serverUrl}/admin/organizations`, {
		method: 'POST',
		credentials: 'include',
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
		},
		body: JSON.stringify({
			name: input.name,
			subscriptionStatus: input.subscriptionStatus,
			billingMode: 'manual_invoice',
			billingContactName: input.billingContactName,
			billingContactEmail: input.billingContactEmail,
			subscriptionNotes: input.subscriptionNotes,
			mainContactEmail: input.mainContactEmail,
			phoneNumber: input.phoneNumber,
			mailingCountry: input.mailingCountry,
			mailingAddressLine1: input.mailingAddressLine1,
			mailingAddressLine2: input.mailingAddressLine2,
			mailingLocality: input.mailingLocality,
			mailingRegion: input.mailingRegion,
			mailingPostalCode: input.mailingPostalCode,
			linkRequesterAsOwner: input.linkRequesterAsOwner,
		}),
	});

	const body = (await response.json()) as AdminOrganization | { readonly error: string };

	if (!response.ok || 'error' in body) {
		throw new Error('Unable to create organization.');
	}

	return body;
}

export async function listOrganizationMemberships(
	organizationId: string,
	serverUrl = getServerUrl(),
): Promise<OrganizationMembershipsResult> {
	const response = await fetch(`${serverUrl}/admin/organizations/${organizationId}/memberships`, {
		credentials: 'include',
		headers: {
			accept: 'application/json',
		},
	});

	const body = (await response.json()) as
		| OrganizationMembershipsResult
		| { readonly error: string };

	if (!response.ok || 'error' in body) {
		throw new Error('Unable to load organization memberships.');
	}

	return body;
}

export async function inviteAdminUser(
	organizationId: string,
	input: InviteAdminUserInput,
	serverUrl = getServerUrl(),
): Promise<AdminMembership> {
	const response = await fetch(`${serverUrl}/admin/organizations/${organizationId}/invitations`, {
		method: 'POST',
		credentials: 'include',
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
		},
		body: JSON.stringify({
			email: input.email,
			displayName: input.displayName,
			role: input.role,
		}),
	});

	const body = (await response.json()) as
		| { readonly membership: AdminMembership }
		| { readonly error: string };

	if (!response.ok || 'error' in body) {
		throw new Error('Unable to invite user.');
	}

	return body.membership;
}

export async function loadAdminFoundations(
	organizationId: string,
	serverUrl = getServerUrl(),
): Promise<AdminFoundations> {
	const response = await fetch(`${serverUrl}/admin/organizations/${organizationId}/foundations`, {
		credentials: 'include',
		headers: {
			accept: 'application/json',
		},
	});

	const body = (await response.json()) as AdminFoundations | { readonly error: string };

	if (!response.ok || 'error' in body) {
		throw new Error('Unable to load foundations.');
	}

	return body;
}

export async function createAddressForOrganization(
	organizationId: string,
	input: CreateAddressInput,
	serverUrl = getServerUrl(),
): Promise<AdminAddress> {
	return postJson<AdminAddress>(
		`${serverUrl}/admin/organizations/${organizationId}/addresses`,
		input,
		'Unable to create address.',
	);
}

export async function createRegionFolderForOrganization(
	organizationId: string,
	input: CreateRegionFolderInput,
	serverUrl = getServerUrl(),
): Promise<AdminRegionFolder> {
	return postJson<AdminRegionFolder>(
		`${serverUrl}/admin/organizations/${organizationId}/region-folders`,
		input,
		'Unable to create region folder.',
	);
}

export async function createRegionForOrganization(
	organizationId: string,
	input: CreateRegionInput,
	serverUrl = getServerUrl(),
): Promise<AdminRegion> {
	return postJson<AdminRegion>(
		`${serverUrl}/admin/organizations/${organizationId}/regions`,
		input,
		'Unable to create region.',
	);
}

export async function createAdminGenus(
	input: CreateGenusInput,
	serverUrl = getServerUrl(),
): Promise<AdminGenus> {
	return postJson<AdminGenus>(`${serverUrl}/admin/genera`, input, 'Unable to create genus.');
}

export async function createAdminSpecies(
	input: CreateSpeciesInput,
	serverUrl = getServerUrl(),
): Promise<AdminSpecies> {
	return postJson<AdminSpecies>(`${serverUrl}/admin/species`, input, 'Unable to create species.');
}

export async function enableSpeciesForOrganization(
	organizationId: string,
	input: EnableOrganizationSpeciesInput,
	serverUrl = getServerUrl(),
): Promise<AdminOrganizationSpecies> {
	return postJson<AdminOrganizationSpecies>(
		`${serverUrl}/admin/organizations/${organizationId}/species`,
		input,
		'Unable to enable species.',
	);
}

export async function createLookupForOrganization(
	organizationId: string,
	kind: AdminLookupKind,
	input: CreateLookupInput,
	serverUrl = getServerUrl(),
): Promise<AdminLookup> {
	return postJson<AdminLookup>(
		`${serverUrl}/admin/organizations/${organizationId}/lookups/${kind}`,
		input,
		'Unable to create lookup.',
	);
}

export async function createTrapForOrganization(
	organizationId: string,
	input: CreateTrapInput,
	serverUrl = getServerUrl(),
): Promise<AdminTrap> {
	return postJson<AdminTrap>(
		`${serverUrl}/admin/organizations/${organizationId}/traps`,
		input,
		'Unable to create trap.',
	);
}

async function postJson<T>(url: string, input: unknown, fallbackMessage: string): Promise<T> {
	const response = await fetch(url, {
		method: 'POST',
		credentials: 'include',
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
		},
		body: JSON.stringify(input),
	});

	const body = (await response.json()) as T | { readonly error: string; readonly reason?: string };

	if (!response.ok || (isRecord(body) && 'error' in body)) {
		throw new Error(
			isRecord(body) && typeof body.reason === 'string' ? body.reason : fallbackMessage,
		);
	}

	return body as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, '');
}
