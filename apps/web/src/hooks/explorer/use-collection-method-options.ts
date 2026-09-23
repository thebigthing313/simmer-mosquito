import { useLiveSuspenseQuery } from '@tanstack/react-db';
import type { FilterOption } from '../../components/explorer/multi-select-filter';
import { collection_methods } from '../../lib/collections/collection_methods';

/**
 * The organization's Collection Methods, as filter options and as an id to name
 * lookup. Retired methods are included. Suspends until the catalog is loaded.
 */
export function useCollectionMethodOptions(): {
	readonly options: readonly FilterOption[];
	readonly nameById: ReadonlyMap<string, string>;
} {
	const result = useLiveSuspenseQuery((query) =>
		query
			.from({ method: collection_methods() })
			.orderBy(({ method }) => method.name, 'asc')
			.select(({ method }) => ({ id: method.id, label: method.name })),
	);

	const options = result.data;

	return {
		options,
		nameById: new Map(options.map((method) => [method.id, method.label] as const)),
	};
}
