import { useLiveSuspenseQuery } from '@tanstack/react-db';
import type { FilterOption } from '../../components/explorer/multi-select-filter';
import { profiles } from '../../lib/collections/profiles';

/**
 * The organization's people, as filter options and as an id to name lookup,
 * ordered by display name in the query's own ordering.
 */
export function usePersonnelOptions(): {
	readonly options: readonly FilterOption[];
	readonly nameById: ReadonlyMap<string, string>;
} {
	const result = useLiveSuspenseQuery((query) =>
		query
			.from({ profile: profiles() })
			.orderBy(({ profile }) => profile.display_name, 'asc')
			.select(({ profile }) => ({ id: profile.id, label: profile.display_name })),
	);

	const people = result.data;

	return {
		options: people,
		nameById: new Map(people.map((profile) => [profile.id, profile.label] as const)),
	};
}
