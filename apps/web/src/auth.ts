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
	readonly ownerLinked: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface CreateAdminOrganizationInput {
	readonly name: string;
	readonly subscriptionStatus: 'trial' | 'active' | 'suspended' | 'canceled';
	readonly billingContactName: string;
	readonly billingContactEmail: string;
	readonly subscriptionNotes: string;
	readonly linkRequesterAsOwner: boolean;
}

export function getServerUrl(): string {
	return trimTrailingSlash(import.meta.env.VITE_SERVER_URL ?? DEFAULT_SERVER_URL);
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
			linkRequesterAsOwner: input.linkRequesterAsOwner,
		}),
	});

	const body = (await response.json()) as AdminOrganization | { readonly error: string };

	if (!response.ok || 'error' in body) {
		throw new Error('Unable to create organization.');
	}

	return body;
}

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, '');
}
