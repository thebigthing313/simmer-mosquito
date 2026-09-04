/**
 * What a Habitat typeahead offers, six at a time.
 *
 * Matches name or description, because a Habitat often has only the second — a
 * catch basin is described by where it is rather than called anything.
 *
 * ## Why retired Habitats are an argument
 *
 * The two pickers this serves disagree, and the disagreement is real rather than
 * an accident of the shape. A control action or a request is new work, and
 * offering a site the agency has retired invites recording against it — so those
 * exclude. The inspection form's picker has always offered every Habitat in the
 * agency, and an inspection is also how a retired site gets looked at again.
 *
 * Neither is obviously wrong, so the caller says which it wants rather than this
 * quietly picking one and changing what an operator can find.
 */

import { and, coalesce, concat, eq, ilike, or, useLiveQuery } from '@tanstack/react-db';
import { habitats } from '../../lib/collections/habitats';
import type { HabitatMatch } from './habitat-view';

export function useHabitatSearch(
	organizationId: string,
	term: string,
	options: { readonly includeRetired?: boolean } = {},
): {
	readonly matches: readonly HabitatMatch[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const trimmed = term.trim();
	const pattern = `%${trimmed}%`;
	const includeRetired = options.includeRetired ?? false;

	const result = useLiveQuery(
		{
			query: (query) => {
				const scoped = query
					.from({ habitat: habitats() })
					.where(({ habitat }) =>
						includeRetired
							? eq(habitat.organization_id, organizationId)
							: and(eq(habitat.organization_id, organizationId), eq(habitat.is_active, true)),
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
						description: habitat.description,
						latitude: habitat.lat,
						longitude: habitat.lng,
					}));
			},
		},
		[organizationId, trimmed, includeRetired],
	);

	return { matches: result.data, isReady: result.isReady, isError: result.isError };
}
