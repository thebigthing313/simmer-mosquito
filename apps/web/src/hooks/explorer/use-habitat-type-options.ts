import { useLiveSuspenseQuery } from '@tanstack/react-db';
import type { FilterOption } from '../../components/explorer/multi-select-filter';
import { habitat_types } from '../../lib/collections/habitat_types';

/**
 * The organization's Habitat Types, as filter options and as an id to name
 * lookup. Retired types are included. Suspends until the catalog is loaded.
 */
export function useHabitatTypeOptions(): {
	readonly options: readonly FilterOption[];
	readonly nameById: ReadonlyMap<string, string>;
} {
	const result = useLiveSuspenseQuery((query) =>
		query
			.from({ type: habitat_types() })
			.orderBy(({ type }) => type.name, 'asc')
			.select(({ type }) => ({ id: type.id, label: type.name })),
	);

	const options = result.data;

	return {
		options,
		nameById: new Map(options.map((type) => [type.id, type.label] as const)),
	};
}
