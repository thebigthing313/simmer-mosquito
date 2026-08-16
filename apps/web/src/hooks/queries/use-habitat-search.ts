/**
 * What a Habitat typeahead offers, six at a time.
 *
 * Matches name or description, because a Habitat often has only the second — a
 * catch basin is described by where it is rather than called anything. Retired
 * Habitats are left out: a picker is for recording new work.
 */

import { and, coalesce, concat, eq, ilike, or, useLiveQuery } from '@tanstack/react-db';
import { habitats } from '../../lib/collections/habitats';
import type { HabitatName } from './habitat-view';

export function useHabitatSearch(
	organizationId: string,
	term: string,
): { readonly matches: readonly HabitatName[]; readonly isReady: boolean } {
	const trimmed = term.trim();
	const pattern = `%${trimmed}%`;

	const result = useLiveQuery(
		{
			query: (query) => {
				const scoped = query
					.from({ habitat: habitats })
					.where(({ habitat }) =>
						and(eq(habitat.organization_id, organizationId), eq(habitat.is_active, true)),
					);

				const matching =
					trimmed.length === 0
						? scoped
						: scoped.where(({ habitat }) =>
								or(ilike(habitat.habitat_name, pattern), ilike(habitat.description, pattern)),
							);

				// The `orderBy` is what lets the `limit` page lazily, and it pages lazily
				// only because `habitat_name` is indexed where the collection is created.
				// Without that index this sorts every loaded Habitat on each keystroke.
				return matching
					.orderBy(({ habitat }) => habitat.habitat_name, 'asc')
					.limit(6)
					.select(({ habitat }) => ({
						id: habitat.id,
						name: coalesce(habitat.habitat_name, concat(habitat.lat, ', ', habitat.lng)),
					}));
			},
		},
		[organizationId, trimmed],
	);

	return { matches: result.data, isReady: result.isReady };
}
