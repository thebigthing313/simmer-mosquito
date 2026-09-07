import { createAuthClient } from '@simmer-mosquito/auth/browser';
import type {
	MembershipStatus,
	OrganizationBillingMode,
	OrganizationSubscriptionStatus,
	SimmerRole,
} from '@simmer-mosquito/domain';
import { sessionFetch } from '@simmer-mosquito/sync/session-fetch';

const DEFAULT_SERVER_URL = 'http://localhost:3000';

/**
 * Identity and the in-app sign-in flow come from the shared browser client —
 * the console signs in through the same public `/auth/*` endpoints the
 * organization workspace does, and `/auth/*` CORS already admits
 * `ADMIN_APP_ORIGIN`. What follows below is the operator control plane proper:
 * the `/admin/*` endpoints only this app calls.
 */
export type { AuthMe, AuthOrganizationChoice } from '@simmer-mosquito/auth/browser';

/**
 * A failed `/admin/*` request, carrying the server's machine-readable `error`
 * code alongside the human message.
 *
 * The code matters for two cases, and they are the ones that decide whether the
 * console works at all. Both are 403s from
 * `createOperatorAuthContextMiddleware`. `operator_required` means "signed in,
 * but not as SIMMER". `operator_not_configured` means the server has no
 * `SIMMER_OPERATOR_ORG_ID`, so it cannot tell an operator from anyone else and
 * refuses everybody. A plain `Error` flattens both into a string, and
 * "operator_required" rendered in a red box is not an explanation. Pages read
 * {@link isOperatorRequiredError} and {@link isOperatorNotConfiguredError}
 * instead and say what happened.
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

/**
 * True when the server answered a refusal rather than a fault: any 4xx.
 *
 * Retrying one cannot change the answer. Both operator refusals are 403s, and
 * react-query's default of three retries with backoff meant the console sat on
 * a loading state for about six seconds before saying what was wrong. The
 * message is the whole point of the screen, so it should not arrive last.
 *
 * 5xx and a dropped connection still retry: those can succeed on a second try.
 */
export function isAdminRefusal(error: unknown): boolean {
	return error instanceof AdminApiError && error.status >= 400 && error.status < 500;
}

/**
 * True when the *server* has no SIMMER organization configured.
 *
 * The mirror of the `VITE_SIMMER_OPERATOR_ORG_ID` refusal this app raises before
 * sign-in, for the other half of the pair. Both variables have to be set and
 * name the same organization; miss the server one and the console signs in fine,
 * then gets refused by every read, and the only thing that can name the variable
 * is the code the server sends back.
 */
export function isOperatorNotConfiguredError(error: unknown): boolean {
	return error instanceof AdminApiError && error.code === 'operator_not_configured';
}

/** One declaration, in `packages/domain`; re-exported for this app's call sites. */
export type { MembershipStatus, SimmerRole } from '@simmer-mosquito/domain';
export interface AdminOrganization {
	readonly id: string;
	readonly workosOrganizationId: string | null;
	readonly name: string;
	readonly slug: string | null;
	readonly subscription: {
		readonly subscriptionStatus: OrganizationSubscriptionStatus;
		readonly billingMode: OrganizationBillingMode;
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

export interface OrganizationMembershipsResult {
	readonly organization: AdminOrganization;
	readonly memberships: AdminMembership[];
}

export interface FoundationAddress {
	readonly id: string;
	readonly displayName: string;
	readonly locality: string | null;
	readonly region: string | null;
	readonly postalCode: string | null;
	readonly country: string;
}

export interface FoundationRegionFolder {
	readonly id: string;
	readonly name: string;
	readonly description: string | null;
}

export interface FoundationRegion {
	readonly id: string;
	readonly regionFolderId: string | null;
	readonly name: string;
	readonly description: string | null;
}

export interface FoundationGenus {
	readonly id: string;
	readonly name: string;
	readonly abbreviation: string;
}

export interface FoundationSpecies {
	readonly id: string;
	readonly genusId: string | null;
	readonly displayName: string;
	readonly commonName: string | null;
}

export interface FoundationOrganizationSpecies {
	readonly id: string;
	readonly speciesId: string;
}

export interface FoundationLookup {
	readonly id: string;
	readonly name: string;
	readonly description: string | null;
	readonly actionThreshold: number | null;
	readonly isActive: boolean;
}

export interface FoundationTrap {
	readonly id: string;
	readonly collectionMethodId: string;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	readonly isActive: boolean;
}

/** Everything a new organization needs standing up, in one operator read. */
export interface OrganizationFoundations {
	readonly addresses: readonly FoundationAddress[];
	readonly regionFolders: readonly FoundationRegionFolder[];
	readonly regions: readonly FoundationRegion[];
	readonly genera: readonly FoundationGenus[];
	readonly species: readonly FoundationSpecies[];
	readonly organizationSpecies: readonly FoundationOrganizationSpecies[];
	readonly lookups: {
		readonly collectionMethods: readonly FoundationLookup[];
		readonly collectionLures: readonly FoundationLookup[];
		readonly habitatTypes: readonly FoundationLookup[];
	};
	readonly traps: readonly FoundationTrap[];
}

export interface CreateAdminOrganizationInput {
	readonly name: string;
	readonly subscriptionStatus: AdminOrganization['subscription']['subscriptionStatus'];
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
 * — `createAdminOrganization`'s `linkRequesterAsOwner` makes the operator the
 * new organization's first owner — so the prompt is a designed-for case, not
 * stale data, and it will keep coming back.
 *
 * The console answers it without asking, because the answer is always the same:
 * an operator working in the control plane is acting as SIMMER. The server now
 * reads exactly that organization off the session to decide operator access, so
 * answering the challenge with it is not friction removal but the thing that
 * puts the session in the org the console needs.
 *
 * Deliberately **not** server-side. Keyed off operator identity in
 * `/auth/sign-in` it would strip the picker from `apps/web` too, and an
 * operator who genuinely holds an organization membership needs that choice
 * there — the organization workspace reads the organization for everything it
 * shows.
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
 * — the *organization* workspace — unless the caller names somewhere else.
 * Asked without a `returnTo`, the console signed the operator out and dropped
 * them on `apps/web`'s sign-in page, on a different origin, with nothing on it
 * pointing back here. That is worst on the screen that most often offers the
 * button: "Not an Operator Account", where the operator's next move is to sign
 * in as someone who *is* one, and the only page that lets them do that is this
 * app's.
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

export async function listAdminOrganizations(
	serverUrl = getServerUrl(),
): Promise<AdminOrganization[]> {
	const { organizations } = await getJson<{ readonly organizations?: AdminOrganization[] }>(
		'/admin/organizations',
		'Unable to load organizations.',
		serverUrl,
	);
	// A 200 carrying neither the list nor an `error` is a fault, not a refusal.
	// Handing the directory `undefined` would draw the empty state, which reads
	// as "the platform has no organizations on it".
	if (organizations === undefined) {
		throw new Error('Unable to load organizations.');
	}

	return organizations;
}

export async function createAdminOrganization(
	input: CreateAdminOrganizationInput,
	serverUrl = getServerUrl(),
): Promise<AdminOrganization> {
	return postJson<AdminOrganization>(
		'/admin/organizations',
		{ ...input, billingMode: 'manual_invoice' },
		serverUrl,
	);
}

export async function listOrganizationMemberships(
	organizationId: string,
	serverUrl = getServerUrl(),
): Promise<OrganizationMembershipsResult> {
	return getJson<OrganizationMembershipsResult>(
		`/admin/organizations/${organizationId}/memberships`,
		'Unable to load memberships.',
		serverUrl,
	);
}

/**
 * One read for everything the Foundations page stands an organization up with:
 * its regions and addresses, the lookups its forms choose from, the species it
 * sees locally, and its traps.
 *
 * It lives here because the console has one door to `/admin/*`. The page built
 * its own until #612, which threw a plain `Error`, so the code never reached
 * {@link isOperatorNotConfiguredError} or {@link isAdminRefusal}: the page drew
 * a red box saying "operator not configured" and the query client retried the
 * 403 three times first.
 */
export async function getOrganizationFoundations(
	organizationId: string,
	serverUrl = getServerUrl(),
): Promise<OrganizationFoundations> {
	return getJson<OrganizationFoundations>(
		`/admin/organizations/${organizationId}/foundations`,
		'Unable to load foundations.',
		serverUrl,
	);
}

export interface InviteAdminUserResult {
	/**
	 * `null` when the address already reaches the organization through WorkOS, so
	 * no invitation was sent. The role is staged either way.
	 */
	readonly invitation: { readonly id: string; readonly email: string } | null;
	readonly membership: AdminMembership;
}

export async function inviteAdminUser(
	organizationId: string,
	input: InviteAdminUserInput,
	serverUrl = getServerUrl(),
): Promise<InviteAdminUserResult> {
	return postJson<InviteAdminUserResult>(
		`/admin/organizations/${organizationId}/invitations`,
		input,
		serverUrl,
	);
}

/**
 * A write to one of the *organization's* own endpoints, sent from the console.
 *
 * The Foundations page creates through `/foundation/*` and
 * `/adult-surveillance/*` as a member of the organization it entered (ADR
 * 0011), so those calls are not this module's to own and stay on that page.
 * What they cannot own is the refusal: one class carries the code, one function
 * writes the message, and this is how a call outside this module gets both.
 */
export async function postOrganizationCommand<T>(path: string, command: unknown): Promise<T> {
	return postJson<T>(path, command, getServerUrl());
}

/** Every `/admin/*` read. The path is a path, so the server URL is applied once. */
async function getJson<T>(path: string, fallback: string, serverUrl: string): Promise<T> {
	const response = await sessionFetch(`${serverUrl}${path}`, {
		credentials: 'include',
		headers: { accept: 'application/json' },
	});

	return readJsonResponse<T>(response, fallback);
}

async function postJson<T>(path: string, input: unknown, serverUrl: string): Promise<T> {
	const response = await sessionFetch(`${serverUrl}${path}`, {
		method: 'POST',
		credentials: 'include',
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
		},
		body: JSON.stringify(input),
	});

	return readJsonResponse<T>(response, 'Request failed.');
}

async function readJsonResponse<T>(response: Response, fallback: string): Promise<T> {
	const body = await readResponseBody<T | { readonly error: string; readonly reason?: string }>(
		response,
	);
	if (!response.ok || (isRecord(body) && 'error' in body)) {
		throw adminApiError(response, body, fallback);
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
