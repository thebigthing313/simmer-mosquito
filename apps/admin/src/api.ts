const DEFAULT_SERVER_URL = 'http://localhost:3000';

export interface AuthUser {
	readonly workosUserId: string;
	readonly email: string;
	readonly displayName: string;
	readonly profilePictureUrl: string | null;
}

export interface AuthenticatedMe {
	readonly authenticated: true;
	readonly user: AuthUser;
	readonly workosOrganizationId: string | null;
	readonly localIdentity: {
		readonly userId: string;
		readonly organizationId: string | null;
		readonly profileId: string | null;
		readonly membershipId: string | null;
		readonly role: string | null;
	};
}

export interface UnauthenticatedMe {
	readonly authenticated: false;
	readonly reason: string;
}

export type AuthMe = AuthenticatedMe | UnauthenticatedMe;

export type SimmerRole = 'owner' | 'admin' | 'manager' | 'collector' | 'viewer';
export type MembershipStatus = 'active' | 'inactive' | 'invited';
export type UnitType =
	| 'weight'
	| 'distance'
	| 'area'
	| 'volume'
	| 'temperature'
	| 'duration'
	| 'count'
	| 'speed';
export type UnitSystem = 'si' | 'imperial' | 'us_customary';

export interface AdminAgency {
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

export interface AgencyMembershipsResult {
	readonly organization: AdminAgency;
	readonly memberships: AdminMembership[];
}

export interface CreateAdminAgencyInput {
	readonly name: string;
	readonly subscriptionStatus: AdminAgency['subscription']['subscriptionStatus'];
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

export interface CreateAdminGenusInput {
	readonly abbreviation: string;
	readonly name: string;
}

export interface CreateAdminSpeciesInput {
	readonly genusId: string | null;
	readonly epithet: string;
	readonly commonName: string;
	readonly displayName: string;
}

export interface AdminUnit {
	readonly id: string;
	readonly code: string;
	readonly unitName: string;
	readonly abbreviation: string;
	readonly unitType: UnitType;
	readonly unitSystem: UnitSystem;
	readonly createdAt: string;
}

export interface CreateAdminUnitInput {
	readonly code: string;
	readonly unitName: string;
	readonly abbreviation: string;
	readonly unitType: UnitType;
	readonly unitSystem: UnitSystem;
}

export interface AdminMutationResult<TRow> {
	readonly row: TRow;
	readonly txid: number;
}

export function getServerUrl(): string {
	return trimTrailingSlash(import.meta.env.VITE_SERVER_URL ?? DEFAULT_SERVER_URL);
}

export function adminLoginUrl(serverUrl = getServerUrl()): string {
	const returnTo = `${window.location.origin}/`;
	return `${serverUrl}/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export async function getAuthMe(serverUrl = getServerUrl()): Promise<AuthMe> {
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

export async function listAdminAgencies(serverUrl = getServerUrl()): Promise<AdminAgency[]> {
	const response = await fetch(`${serverUrl}/admin/organizations`, {
		credentials: 'include',
		headers: { accept: 'application/json' },
	});
	const body = (await response.json()) as
		| { readonly organizations: AdminAgency[] }
		| { readonly error: string };

	if (!response.ok || !('organizations' in body)) {
		throw new Error('Unable to load agencies.');
	}

	return body.organizations;
}

export async function createAdminAgency(
	input: CreateAdminAgencyInput,
	serverUrl = getServerUrl(),
): Promise<AdminAgency> {
	return postJson<AdminAgency>(`${serverUrl}/admin/organizations`, {
		...input,
		billingMode: 'manual_invoice',
	});
}

export async function listAgencyMemberships(
	agencyId: string,
	serverUrl = getServerUrl(),
): Promise<AgencyMembershipsResult> {
	const response = await fetch(`${serverUrl}/admin/organizations/${agencyId}/memberships`, {
		credentials: 'include',
		headers: { accept: 'application/json' },
	});
	const body = (await response.json()) as AgencyMembershipsResult | { readonly error: string };

	if (!response.ok || 'error' in body) {
		throw new Error('Unable to load memberships.');
	}

	return body;
}

export async function inviteAdminUser(
	agencyId: string,
	input: InviteAdminUserInput,
	serverUrl = getServerUrl(),
): Promise<AdminMembership> {
	const body = await postJson<{ readonly membership: AdminMembership }>(
		`${serverUrl}/admin/organizations/${agencyId}/invitations`,
		input,
	);
	return body.membership;
}

export async function createAdminGenus(
	input: CreateAdminGenusInput,
	serverUrl = getServerUrl(),
): Promise<AdminMutationResult<AdminGenus>> {
	const body = await postJson<{ readonly genus: AdminGenus; readonly txid: number }>(
		`${serverUrl}/admin/genera`,
		input,
	);
	return { row: body.genus, txid: body.txid };
}

export async function createAdminSpecies(
	input: CreateAdminSpeciesInput,
	serverUrl = getServerUrl(),
): Promise<AdminMutationResult<AdminSpecies>> {
	const body = await postJson<{ readonly species: AdminSpecies; readonly txid: number }>(
		`${serverUrl}/admin/species`,
		input,
	);
	return { row: body.species, txid: body.txid };
}

export async function createAdminUnit(
	input: CreateAdminUnitInput,
	serverUrl = getServerUrl(),
): Promise<AdminMutationResult<AdminUnit>> {
	const body = await postJson<{ readonly unit: AdminUnit; readonly txid: number }>(
		`${serverUrl}/admin/units`,
		input,
	);
	return { row: body.unit, txid: body.txid };
}

async function postJson<T>(url: string, input: unknown): Promise<T> {
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
			isRecord(body) && typeof body.reason === 'string' ? body.reason : 'Request failed.',
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
