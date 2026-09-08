/**
 * The organization's people, as the record forms need them.
 *
 * Distinct from `usePersonnelOptions`, which the explorers use: that one drops
 * `is_active` and returns options already sorted, because a filter offers a flat
 * list of everyone who has ever done the work. A form has to say more. A
 * deactivated Profile stays selectable — the same forms are where past seasons
 * get keyed in, and the person who did that work in 2024 may have left since — so
 * the lifecycle flag has to survive the read and reach `lifecycleOptions`, which
 * marks the row and sorts it behind everyone still in service.
 *
 * Distinct again from `useProfileNames`, which is an id→name lookup for rows that
 * arrive naming an actor by id alone. This is the roster itself.
 *
 * Unordered on purpose: `lifecycleOptions` sorts by service status and then by
 * `localeCompare`, which is the ordering a person scanning a picker expects, and
 * which the query pipeline's `orderBy` cannot reproduce.
 */

import { useLiveQuery } from '@tanstack/react-db';
import { profiles } from '../../lib/collections/profiles';

/** A Profile as a picker reads one: who they are, and whether they are still here. */
export interface ProfileListing {
	readonly id: string;
	readonly displayName: string;
	readonly isActive: boolean;
}

export function useProfileRoster(): readonly ProfileListing[] {
	const result = useLiveQuery(
		(query) =>
			query.from({ profile: profiles() }).select(({ profile }) => ({
				id: profile.id,
				displayName: profile.display_name,
				isActive: profile.is_active,
			})),
		[],
	);

	return result.data;
}
