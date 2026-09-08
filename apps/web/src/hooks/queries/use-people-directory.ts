/**
 * The organization's people, in the three groups the People section draws.
 *
 * A **Profile** is who work is attributed to; a **Membership** is the access
 * that links a login to it. The two are separate records on purpose — a Profile
 * outlives the access, which is what lets an organization end somebody's login
 * without detaching every inspection they ever recorded — so this is a left
 * join and the membership half is genuinely optional.
 *
 * The groups are what the section shows, not a filter a caller passes:
 *
 * - **activeLinked** — a login, still working.
 * - **inactiveLinked** — a login, no longer working. Their records stay attributed.
 * - **historical** — no login at all. Somebody the organization records work
 *   against who never signed in, or left before SIMMER. Active ones first,
 *   because an inactive historical Profile is the deepest end of the list and
 *   the least likely to be wanted.
 *
 * Each group is its own query rather than one query grouped in JavaScript,
 * because the predicates and the sort differ and both push down.
 */

import type { SimmerRole } from '@simmer-mosquito/domain';
import { eq, isNull, not, useLiveSuspenseQuery } from '@tanstack/react-db';
import { memberships } from '../../lib/collections/memberships';
import { profiles } from '../../lib/collections/profiles';

/**
 * One person, flat.
 *
 * Flat rather than `{ profile, membership }` because a compiled `select` is what
 * narrows the query, and it produces one row — nesting it would mean a `.map()`
 * in the hook body, which re-runs every render and hands every consumer new
 * objects.
 *
 * The membership half is nullish on a Profile with no login, and the type says
 * `null | undefined` rather than picking one: it comes from the unmatched side
 * of a left join, and which of the two the library yields there is its business
 * rather than something this should assert. Ask `membershipId == null` — one
 * question, both answers.
 */
export interface PersonListing {
	readonly profileId: string;
	readonly displayName: string;
	readonly isActive: boolean;
	/** `null` for a historical Profile — nobody signs in as them. */
	readonly userId: string | null;
	readonly email: string | null;
	readonly membershipId: string | null | undefined;
	readonly role: SimmerRole | null | undefined;
	readonly membershipStatus: string | null | undefined;
}

type PersonGroup = 'activeLinked' | 'inactiveLinked' | 'historical';

export function usePeopleDirectory(): {
	readonly activeLinked: readonly PersonListing[];
	readonly inactiveLinked: readonly PersonListing[];
	readonly historical: readonly PersonListing[];
} {
	return {
		activeLinked: usePersonGroup('activeLinked'),
		inactiveLinked: usePersonGroup('inactiveLinked'),
		historical: usePersonGroup('historical'),
	};
}

function usePersonGroup(group: PersonGroup): readonly PersonListing[] {
	const result = useLiveSuspenseQuery(
		(query) => {
			const joined = query
				.from({ profile: profiles() })
				.leftJoin({ membership: memberships() }, ({ profile, membership }) =>
					eq(profile.id, membership.profile_id),
				);

			const scoped =
				group === 'historical'
					? joined
							.where(({ profile }) => isNull(profile.user_id))
							.orderBy(({ profile }) => profile.is_active, 'desc')
							.orderBy(({ profile }) => profile.display_name, 'asc')
					: joined
							.where(({ profile }) => not(isNull(profile.user_id)))
							.where(({ profile }) => eq(profile.is_active, group === 'activeLinked'))
							.orderBy(({ profile }) => profile.display_name, 'asc');

			return scoped.select(({ profile, membership }) => ({
				profileId: profile.id,
				displayName: profile.display_name,
				isActive: profile.is_active,
				userId: profile.user_id,
				email: profile.email,
				membershipId: membership.id,
				role: membership.role,
				membershipStatus: membership.status,
			}));
		},
		[group],
	);

	return result.data as readonly PersonListing[];
}
