import type { SimmerRole } from '@simmer-mosquito/domain';
import { usePersonGroup } from './use-person-group';

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

export type PersonGroup = 'activeLinked' | 'inactiveLinked' | 'historical';

/** The organization's people in the three groups the People section draws: active linked, inactive linked and historical. */
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
