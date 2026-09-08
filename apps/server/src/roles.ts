/**
 * The organization role ladder, and the one place its ordering is written down.
 *
 * SIMMER authorizes on the server rather than through Postgres RLS, so a
 * membership role only means something where a handler checks it. Route guards
 * in `apps/web` hide work a role cannot do; these predicates are what actually
 * refuse it.
 */

import type { SimmerRole } from '@simmer-mosquito/db';

const ROLE_RANK: Record<SimmerRole, number> = {
	owner: 4,
	admin: 3,
	manager: 2,
	collector: 1,
	viewer: 0,
};

/**
 * The floors commands are written against.
 *
 * Four of the five roles are floors. `viewer` is not, because a floor of
 * "viewer-and-above" would be every signed-in membership, which is what the
 * absence of a check already meant.
 *
 * `owner` is a floor, for one thing: **changing somebody's role**. Every other
 * top-of-ladder rule in the domain docs is written "owner/admin", and `admin` is
 * the lower of that pair — settings, catalogs, enabled species all sit there. A
 * role change cannot, because an admin who could set a role could set their own
 * to `owner`, and a rung anyone below it can award themselves is not a rung.
 * That is the whole of what `owner` gates; see {@link canGrantRole} for the same
 * reasoning applied to invitations, which name a role too.
 *
 * Every organization write to Postgres now reads its floor from
 * `COMMAND_PERMISSIONS`. There was a second table here, `IDENTITY_FLOORS`,
 * holding the seven writes that were REST routes instead, and the hole it had
 * is what ADR 0013 closed: a command with no floor does not compile, while a
 * route that never consulted the table was nothing that could fail. The one
 * identity surface left on REST is `people.listMemberships`, which is a read
 * behind a POST, and it carries a plain role check on its own route.
 */
export type MinimumRole = 'owner' | 'admin' | 'manager' | 'collector';

export function hasAtLeastRole(role: SimmerRole, minimum: MinimumRole): boolean {
	return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/**
 * Whether an actor may hand out a role.
 *
 * An invitation names the role the invitee will hold, so "an admin may invite"
 * would otherwise be "an admin may mint an owner" — the same self-promotion
 * `hasAtLeastRole(role, 'owner')` closes on the role-change endpoint, reached by
 * inviting a second account instead. Nobody grants above their own rung; owners
 * can grant anything, including `owner`.
 */
export function canGrantRole(actor: SimmerRole, granted: SimmerRole): boolean {
	return ROLE_RANK[actor] >= ROLE_RANK[granted];
}

export interface ForbiddenBody {
	readonly error: 'forbidden';
	readonly reason: string;
}

export function forbidden(reason: string): ForbiddenBody {
	return { error: 'forbidden', reason };
}
