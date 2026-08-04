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

/** The floors commands are written against: "manager-and-above", "collector-and-above". */
export type MinimumRole = 'manager' | 'collector';

export function hasAtLeastRole(role: SimmerRole, minimum: MinimumRole): boolean {
	return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export interface ForbiddenBody {
	readonly error: 'forbidden';
	readonly reason: string;
}

export function forbidden(reason: string): ForbiddenBody {
	return { error: 'forbidden', reason };
}
