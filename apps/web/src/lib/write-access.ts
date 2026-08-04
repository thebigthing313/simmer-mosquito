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

/** Every role except `viewer` records field work. */
export function canWriteRecords(auth: AuthMe | null): boolean {
	return readOrgRole(auth) !== 'viewer';
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
