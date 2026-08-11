import { createAuthClient } from '@simmer-mosquito/auth/browser';

const DEFAULT_SERVER_URL = 'http://localhost:3000';

/**
 * Identity and the in-app sign-in flow come from the shared browser client —
 * the console signs in through the same public `/auth/*` endpoints the agency
 * workspace does, and `/auth/*` CORS already admits `ADMIN_APP_ORIGIN`. What
 * follows below is the operator control plane proper: the `/admin/*` endpoints
 * only this app calls.
 */
export type { AuthMe, AuthOrganizationChoice } from '@simmer-mosquito/auth/browser';

/**
 * A failed `/admin/*` request, carrying the server's machine-readable `error`
 * code alongside the human message.
 *
 * The code matters for exactly one case, but it is the case that decides whether
 * the console works at all: `operator_required` is a 403 from
 * `createOperatorAuthContextMiddleware` meaning "signed in, but not on
 * `SIMMER_OPERATOR_EMAILS`". A plain `Error` flattens that into a string, and
 * "operator_required" rendered in a red box is not an explanation. Pages read
 * {@link isOperatorRequiredError} instead and say what happened.
 */
class AdminApiError extends Error {
	readonly code: string | null;
	readonly status: number;

	constructor(message: string, options: { readonly code: string | null; readonly status: number }) {
		super(message);
		this.name = 'AdminApiError';
		this.code = options.code;
		this.status = options.status;
	}
}

/** True when the signed-in account is not on the server's operator allowlist. */
export function isOperatorRequiredError(error: unknown): boolean {
	return error instanceof AdminApiError && error.code === 'operator_required';
}

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
	readonly id?: string;
	readonly abbreviation: string;
	readonly name: string;
}

export interface UpdateAdminGenusInput extends CreateAdminGenusInput {}

export interface CreateAdminSpeciesInput {
	readonly id?: string;
	readonly genusId: string | null;
	readonly epithet: string;
	readonly commonName: string;
	readonly displayName: string;
}

export interface UpdateAdminSpeciesInput extends CreateAdminSpeciesInput {}

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
	readonly id?: string;
	readonly code: string;
	readonly unitName: string;
	readonly abbreviation: string;
	readonly unitType: UnitType;
	readonly unitSystem: UnitSystem;
}

export interface UpdateAdminUnitInput extends CreateAdminUnitInput {}

export interface AdminMutationResult<TRow> {
	readonly row: TRow;
	readonly txid: number;
}

export function getServerUrl(): string {
	// Empty read as absent, not as a URL — `??` does not fall back on `''`, and
	// a build variable arrives empty rather than missing whenever a field is
	// left blank or a Docker `ARG` is declared without being passed.
	const configured = import.meta.env.VITE_SERVER_URL?.trim();
	return trimTrailingSlash(
		configured === undefined || configured === '' ? DEFAULT_SERVER_URL : configured,
	);
}

/**
 * The WorkOS organization that *is* SIMMER, for this environment.
 *
 * WorkOS will not mint a session for an account that belongs to more than one
 * organization until one is chosen. Operators routinely belong to more than one
 * — `createAdminAgency`'s `linkRequesterAsOwner` makes the operator the new
 * agency's first owner — so the prompt is a designed-for case, not stale data,
 * and it will keep coming back.
 *
 * The console answers it without asking, because the answer is always the same:
 * an operator working in the control plane is acting as SIMMER. Nothing here
 * reads the organization (the `SIMMER_OPERATOR_EMAILS` allowlist is the whole
 * grant), so the choice was pure friction.
 *
 * Deliberately **not** server-side. Keyed off operator identity in
 * `/auth/sign-in` it would strip the picker from `apps/web` too, and an operator
 * who genuinely holds an agency membership needs that choice there — the agency
 * workspace reads the organization for everything it shows.
 *
 * Unset, or set to an organization this account is not in, falls back to the
 * picker rather than failing.
 */
export function getOperatorOrganizationId(): string | null {
	const value = import.meta.env.VITE_SIMMER_OPERATOR_ORG_ID;
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

const authClient = createAuthClient({ serverUrl: getServerUrl() });

export const { getAuthMe, selectOrganization, signIn, switchOrganization, verifyEmail } =
	authClient;

/**
 * Where "Sign out" goes.
 *
 * `/auth/logout` clears the cookie and then returns the browser to `APP_ORIGIN`
 * — the *agency* workspace — unless the caller names somewhere else. Asked
 * without a `returnTo`, the console signed the operator out and dropped them on
 * `apps/web`'s sign-in page, on a different origin, with nothing on it pointing
 * back here. That is worst on the screen that most often offers the button:
 * "Not an Operator Account", where the operator's next move is to sign in as
 * someone who *is* one, and the only page that lets them do that is this app's.
 *
 * The server honours `returnTo` only for origins it already trusts (`APP_ORIGIN`
 * and `ADMIN_APP_ORIGIN`), so this reads the console's own origin rather than a
 * `VITE_*` of its own: whichever host served this bundle is by definition the
 * admin app, and the pair cannot drift apart.
 */
export function adminLogoutUrl(serverUrl = getServerUrl()): string {
	const url = new URL(`${serverUrl}/auth/logout`);
	url.searchParams.set('returnTo', `${window.location.origin}/sign-in`);
	return url.toString();
}

export async function listAdminAgencies(serverUrl = getServerUrl()): Promise<AdminAgency[]> {
	const response = await fetch(`${serverUrl}/admin/organizations`, {
		credentials: 'include',
		headers: { accept: 'application/json' },
	});
	const body = await readResponseBody<
		{ readonly organizations: AdminAgency[] } | { readonly error: string; readonly reason?: string }
	>(response);

	if (!response.ok || !('organizations' in body)) {
		throw adminApiError(response, body, 'Unable to load agencies.');
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
	const body = await readResponseBody<
		AgencyMembershipsResult | { readonly error: string; readonly reason?: string }
	>(response);

	if (!response.ok || 'error' in body) {
		throw adminApiError(response, body, 'Unable to load memberships.');
	}

	return body;
}

export interface InviteAdminUserResult {
	/**
	 * `null` when the address already reaches the agency through WorkOS, so no
	 * invitation was sent. The role is staged either way.
	 */
	readonly invitation: { readonly id: string; readonly email: string } | null;
	readonly membership: AdminMembership;
}

export async function inviteAdminUser(
	agencyId: string,
	input: InviteAdminUserInput,
	serverUrl = getServerUrl(),
): Promise<InviteAdminUserResult> {
	return postJson<InviteAdminUserResult>(
		`${serverUrl}/admin/organizations/${agencyId}/invitations`,
		input,
	);
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

export async function updateAdminGenus(
	genusId: string,
	input: UpdateAdminGenusInput,
	serverUrl = getServerUrl(),
): Promise<AdminMutationResult<AdminGenus>> {
	const body = await patchJson<{ readonly genus: AdminGenus; readonly txid: number }>(
		`${serverUrl}/admin/genera/${genusId}`,
		input,
	);
	return { row: body.genus, txid: body.txid };
}

export async function deleteAdminGenus(
	genusId: string,
	serverUrl = getServerUrl(),
): Promise<AdminMutationResult<AdminGenus>> {
	const body = await deleteJson<{ readonly genus: AdminGenus; readonly txid: number }>(
		`${serverUrl}/admin/genera/${genusId}`,
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

export async function updateAdminSpecies(
	speciesId: string,
	input: UpdateAdminSpeciesInput,
	serverUrl = getServerUrl(),
): Promise<AdminMutationResult<AdminSpecies>> {
	const body = await patchJson<{ readonly species: AdminSpecies; readonly txid: number }>(
		`${serverUrl}/admin/species/${speciesId}`,
		input,
	);
	return { row: body.species, txid: body.txid };
}

export async function deleteAdminSpecies(
	speciesId: string,
	serverUrl = getServerUrl(),
): Promise<AdminMutationResult<AdminSpecies>> {
	const body = await deleteJson<{ readonly species: AdminSpecies; readonly txid: number }>(
		`${serverUrl}/admin/species/${speciesId}`,
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

export async function updateAdminUnit(
	unitId: string,
	input: UpdateAdminUnitInput,
	serverUrl = getServerUrl(),
): Promise<AdminMutationResult<AdminUnit>> {
	const body = await patchJson<{ readonly unit: AdminUnit; readonly txid: number }>(
		`${serverUrl}/admin/units/${unitId}`,
		input,
	);
	return { row: body.unit, txid: body.txid };
}

export async function deleteAdminUnit(
	unitId: string,
	serverUrl = getServerUrl(),
): Promise<AdminMutationResult<AdminUnit>> {
	const body = await deleteJson<{ readonly unit: AdminUnit; readonly txid: number }>(
		`${serverUrl}/admin/units/${unitId}`,
	);
	return { row: body.unit, txid: body.txid };
}

async function postJson<T>(url: string, input: unknown): Promise<T> {
	return writeJson<T>(url, 'POST', input);
}

async function patchJson<T>(url: string, input: unknown): Promise<T> {
	return writeJson<T>(url, 'PATCH', input);
}

async function deleteJson<T>(url: string): Promise<T> {
	const response = await fetch(url, {
		method: 'DELETE',
		credentials: 'include',
		headers: {
			accept: 'application/json',
		},
	});

	return readJsonResponse<T>(response);
}

async function writeJson<T>(url: string, method: 'PATCH' | 'POST', input: unknown): Promise<T> {
	const response = await fetch(url, {
		method,
		credentials: 'include',
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
		},
		body: JSON.stringify(input),
	});

	return readJsonResponse<T>(response);
}

async function readJsonResponse<T>(response: Response): Promise<T> {
	const body = await readResponseBody<T | { readonly error: string; readonly reason?: string }>(
		response,
	);
	if (!response.ok || (isRecord(body) && 'error' in body)) {
		throw adminApiError(response, body, 'Request failed.');
	}

	return body as T;
}

async function readResponseBody<T>(response: Response): Promise<T> {
	const text = await response.text();
	if (text.trim() === '') {
		return {} as T;
	}
	try {
		return JSON.parse(text) as T;
	} catch {
		throw new Error(
			response.ok ? 'Received an unreadable server response.' : 'Server response was unreadable.',
		);
	}
}

function adminApiError(response: Response, body: unknown, fallback: string): AdminApiError {
	const code = isRecord(body) && typeof body.error === 'string' ? body.error : null;
	return new AdminApiError(responseErrorMessage(body, fallback), {
		code,
		status: response.status,
	});
}

function responseErrorMessage(body: unknown, fallback: string): string {
	if (isRecord(body)) {
		if (typeof body.reason === 'string' && body.reason.trim() !== '') {
			return body.reason;
		}
		if (typeof body.error === 'string' && body.error.trim() !== '') {
			return body.error;
		}
	}
	return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, '');
}
