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

export interface AdminAddress {
	readonly id: string;
	readonly organizationId: string;
	readonly featureId: string;
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
	readonly featureId: string;
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
	readonly featureId: string;
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
