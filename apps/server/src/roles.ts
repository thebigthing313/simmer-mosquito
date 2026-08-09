/**
 * The agency role ladder, and the one place its ordering is written down.
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

/**
 * Every agency write that is not a command, and the floor it sits behind.
 *
 * `COMMAND_PERMISSIONS` is total over `AgencyCommandType`, which is what stops
 * ~95 endpoints drifting: a command with no floor does not compile. These
 * surfaces cannot join it, and the reason is not that nobody got round to it
 * (#130).
 *
 * **They have no commands.** A domain command is an intent a client generates,
 * applies optimistically, and can safely replay. Identity writes are not that:
 * they land in WorkOS *and* Postgres, and a replayed invitation or role change
 * is a second grant rather than the same one. So `organization-commands.ts` and
 * `profile-commands.ts` are ordinary REST endpoints that write directly, with
 * no command type to key a map by. One of them — `POST
 * /organization/memberships/list` — is a read behind a POST, and could never be
 * a command permission at all.
 *
 * What they can have is the same *table*: floors declared in one readable
 * place, away from the handlers that forget them. Be clear about how much that
 * buys, because it is less than the command map buys. Removing a surface's
 * floor, or adding a surface without one, fails the build. Adding a whole new
 * route and never naming a surface does not — nothing forces the call, the way
 * a command type forces a map entry. It is a smaller promise, honestly kept.
 *
 * Floors only. The people surface also refuses by {@link canGrantRole}, twice —
 * against the role named in an invitation, and against the role of the
 * membership being ended — and neither is a floor, because both compare the
 * actor to a value rather than to a rung. Those stay in `profile-commands.ts`,
 * beside the payload and the row they read.
 */
export type IdentityWriteSurface =
	| 'organization.updateDetails'
	| 'people.createProfile'
	| 'people.updateProfile'
	| 'people.listMemberships'
	| 'people.changeRole'
	| 'people.endMembership'
	| 'people.invite';

interface IdentityFloor {
	readonly minimum: MinimumRole;
	readonly refusal: string;
}

const IDENTITY_FLOORS: Record<IdentityWriteSurface, IdentityFloor> = {
	'organization.updateDetails': {
		minimum: 'admin',
		refusal: 'Only organization owners and admins can manage details.',
	},

	// The people floor is admin, not owner: an agency delegates onboarding, and
	// an office manager adding a seasonal crew is the ordinary case. Handing out
	// a role is the separate question below.
	'people.createProfile': {
		minimum: 'admin',
		refusal: 'Only organization owners and admins can manage people.',
	},
	'people.updateProfile': {
		minimum: 'admin',
		refusal: 'Only organization owners and admins can manage people.',
	},
	'people.listMemberships': {
		minimum: 'admin',
		refusal: 'Only organization owners and admins can manage people.',
	},
	'people.endMembership': {
		minimum: 'admin',
		refusal: 'Only organization owners and admins can manage people.',
	},
	'people.invite': {
		minimum: 'admin',
		refusal: 'Only organization owners and admins can manage people.',
	},

	// Owner, because a settable role is a self-promotable one — see MinimumRole.
	'people.changeRole': {
		minimum: 'owner',
		refusal: 'Only organization owners can change a role.',
	},
};

/**
 * The route-boundary check for an identity write.
 *
 * Structurally typed against the context rather than importing Hono, so this
 * file stays what it says it is: the ladder, and nothing that serves it.
 */
export function denyIdentityWrite(
	context: {
		readonly get: (key: 'authContext') => { readonly role: SimmerRole };
		readonly json: (body: ForbiddenBody, status: 403) => Response;
	},
	surface: IdentityWriteSurface,
): Response | null {
	const floor = IDENTITY_FLOORS[surface];
	if (hasAtLeastRole(context.get('authContext').role, floor.minimum)) {
		return null;
	}

	return context.json(forbidden(floor.refusal), 403);
}
