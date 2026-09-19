import type { Collection } from '@tanstack/db';
import { useLiveSuspenseQuery } from '@tanstack/react-db';
import type { FilterOption } from '../../components/explorer/multi-select-filter';

/** A catalog as filter options and as an id to name lookup. */
export interface CatalogOptions {
	readonly options: readonly FilterOption[];
	readonly nameById: ReadonlyMap<string, string>;
}

/**
 * Reads a `name` catalog, ordered by name, as filter options and an id to name
 * lookup. Retired rows are included. Suspends until the catalog is loaded.
 */
export function useNamedCatalog<TRow extends { readonly id: string; readonly name: string }>(
	collection: Collection<TRow, string | number>,
): CatalogOptions {
	const result = useLiveSuspenseQuery((query) =>
		query
			.from({ row: collection })
			.orderBy(({ row }) => row.name, 'asc')
			.select(({ row }) => ({ id: row.id, label: row.name })),
	);

	return indexed(result.data);
}

/** Indexes the options by id. */
export function indexed(options: readonly FilterOption[]): CatalogOptions {
	return { options, nameById: new Map(options.map((row) => [row.id, row.label] as const)) };
}
