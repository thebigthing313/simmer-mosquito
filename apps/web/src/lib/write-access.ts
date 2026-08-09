import type { AuthMe } from '../auth';

/**
 * Whether the signed-in membership may create or change agency records.
 *
 * Viewers are the read-only role, and read-only has to mean it on both sides of
 * a control: hiding the "Record Application" button but leaving
 * `/control-operations/chemical/create` reachable by URL, bookmark, or browser
 * history just moves the refusal to the save, after the form has been filled
 * in. The server is still the authority — this is what keeps the UI from
 * offering work it knows will be rejected.
 *
 * Everything here is deliberately free of React and router imports: it is
 * called from route `beforeLoad` guards, which run before any component does.
 */

export type OrgRole = 'owner' | 'admin' | 'manager' | 'collector' | 'viewer';

const ORG_ROLES: ReadonlySet<string> = new Set<OrgRole>([
	'owner',
	'admin',
	'manager',
	'collector',
	'viewer',
]);

/**
 * The signed-in membership's role, defaulting to `viewer`.
 *
 * An unknown, missing, or unauthenticated role resolves to the *least*
 * privileged one, so a failure to read identity denies rather than grants.
 */
export function readOrgRole(auth: AuthMe | null): OrgRole {
	if (auth?.authenticated !== true) {
		return 'viewer';
	}
	const role = auth.localIdentity.role;
	return role !== null && ORG_ROLES.has(role) ? (role as OrgRole) : 'viewer';
}

/**
 * The ladder, in the same order and with the same three floors the server uses
 * (`apps/server/src/roles.ts`, `apps/server/src/command-permissions.ts`).
 *
 * The two have to agree. When they disagree the UI either offers work the
 * server will refuse — a form filled in and then 403'd on save — or hides work
 * the account is entitled to. Neither is discoverable from the other side, so
 * the ordering is written down twice on purpose and the names match.
 */
const ROLE_RANK: Record<OrgRole, number> = {
	owner: 4,
	admin: 3,
	manager: 2,
	collector: 1,
	viewer: 0,
};

/** The floors commands are written against, mirroring the server's `MinimumRole`. */
export type MinimumRole = 'owner' | 'admin' | 'manager' | 'collector';

export function hasAtLeastRole(auth: AuthMe | null, minimum: MinimumRole): boolean {
	return ROLE_RANK[readOrgRole(auth)] >= ROLE_RANK[minimum];
}

/** Every role except `viewer` records field work. */
export function canWriteRecords(auth: AuthMe | null): boolean {
	return hasAtLeastRole(auth, 'collector');
}

/**
 * Whether this membership plans work rather than only recording it.
 *
 * Manager-and-above: route and assignment planning, mission dispatch, the trap
 * and habitat catalogs, contacts and service requests, regions, and the tag
 * catalog. A collector records against these; they do not shape them.
 */
export function canPlanWork(auth: AuthMe | null): boolean {
	return hasAtLeastRole(auth, 'manager');
}

/**
 * Whether this membership configures the agency.
 *
 * Owner/admin: the lookup catalogs (collection methods, lures, habitat types),
 * species curation, control methods, insecticides and formulations, and the
 * notification type catalog. A manager runs the agency's work with these; only
 * an owner or admin decides what they are.
 */
export function canManageCatalogs(auth: AuthMe | null): boolean {
	return hasAtLeastRole(auth, 'admin');
}

/**
 * Whether this membership manages people: invitations, and the profiles the
 * agency attributes work to.
 *
 * Owner/admin, so an agency can delegate onboarding rather than routing every
 * new crew member through one person. Handing out a *role* is a different
 * question — see {@link canManageRoles}.
 */
export function canManagePeople(auth: AuthMe | null): boolean {
	return hasAtLeastRole(auth, 'admin');
}

/**
 * Whether this membership can change somebody's role.
 *
 * Owner only, and the one thing that is. An admin who could set a role could
 * set their own to `owner`, so the server refuses it (`roles.ts`) and the UI
 * must not offer it — an admin shown a role control would fill it in and be
 * 403'd on save.
 */
export function canManageRoles(auth: AuthMe | null): boolean {
	return hasAtLeastRole(auth, 'owner');
}

/**
 * The roles this membership may hand out in an invitation, highest first.
 *
 * Nobody invites above their own rung — an invitation names a role, so offering
 * `owner` to an admin would be offering the self-promotion the role-change
 * endpoint refuses, reached by inviting a second account instead. The server
 * enforces it (`canGrantRole` in `roles.ts`); this keeps the picker from showing
 * a choice that would 403 on send.
 */
export function grantableRoles(auth: AuthMe | null): readonly OrgRole[] {
	const rank = ROLE_RANK[readOrgRole(auth)];
	return ORG_ROLE_ORDER.filter((role) => ROLE_RANK[role] <= rank);
}

/**
 * Whether this membership may end somebody else's access.
 *
 * The people floor, plus the invitation's bound: nobody removes above their own
 * rung, or "admins may remove" would be "admins may remove every owner". The
 * server refuses both halves (`profile-commands.ts`); this keeps the control off
 * a row it would 403 on.
 *
 * Self-removal is refused server-side too, and hidden here for the same reason
 * — leaving is a different act, and this control is not it.
 */
export function canRemoveMember(auth: AuthMe | null, membership: MembershipTarget): boolean {
	if (!canManagePeople(auth) || membership.id === readMembershipId(auth)) {
		return false;
	}

	return ROLE_RANK[readOrgRole(auth)] >= ROLE_RANK[membership.role];
}

interface MembershipTarget {
	readonly id: string;
	readonly role: OrgRole;
}

function readMembershipId(auth: AuthMe | null): string | null {
	return auth?.authenticated === true ? auth.localIdentity.membershipId : null;
}

const ORG_ROLE_ORDER: readonly OrgRole[] = ['owner', 'admin', 'manager', 'collector', 'viewer'];

/**
 * Whether this membership manages the catalogs that are part of running work
 * rather than part of configuring the agency.
 *
 * Manager-and-above: tags, vehicles, equipment, and *editing* an existing
 * control method (its name and its custom fields). Adding or retiring a method
 * is still {@link canManageCatalogs} — the server splits those two floors
 * apart, `create`/`deactivate`/`reactivate`/`delete` at `ADMIN` and `update` at
 * `MANAGER`, so a page that offers both needs both flags.
 *
 * The same floor as {@link canPlanWork}, and deliberately not the same name:
 * one reads as "may this person shape the work", the other as "may this person
 * shape the lists the work is recorded against". #65 was a manager locked out
 * of the second because the organization workspace only had a word for
 * {@link canManageCatalogs}.
 */
export function canManageOperationalCatalogs(auth: AuthMe | null): boolean {
	return canPlanWork(auth);
}

/**
 * The `beforeLoad` half of the check, for the create/edit routes.
 *
 * Awaits `context.auth.load()` rather than reading the snapshot: on a cold load
 * — a pasted URL, a bookmark, a refresh — the guard runs before identity has
 * resolved, and a snapshot read there would be `null`, which resolves to
 * `viewer` and would bounce everyone.
 *
 * Callers throw their own typed `redirect`, so each form sends its viewer
 * somewhere useful (the list it was opened from, the record it was editing)
 * rather than to a shared dead end.
 */
export async function isWriteBlocked(context: {
	readonly auth: { readonly load: () => Promise<AuthMe> };
}): Promise<boolean> {
	return !canWriteRecords(await context.auth.load());
}

/**
 * The same guard at a higher floor, for the routes a collector cannot use.
 *
 * `isWriteBlocked` is this with `minimum: 'collector'`; it keeps its own name
 * because it reads better at the call sites that only care about viewers, and
 * because most of them predate the rest of the ladder.
 */
export async function isBelowRole(
	context: { readonly auth: { readonly load: () => Promise<AuthMe> } },
	minimum: MinimumRole,
): Promise<boolean> {
	return !hasAtLeastRole(await context.auth.load(), minimum);
}
