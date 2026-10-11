import { useLiveSuspenseQuery } from '@tanstack/react-db';
import type { FilterOption } from '../../components/explorer/multi-select-filter';
import { type CatalogDescriptor, catalogName } from '../queries/catalog-register';

/** A catalog as filter options and as an id to name lookup. */
export interface CatalogOptions {
	readonly options: readonly FilterOption[];
	readonly nameById: ReadonlyMap<string, string>;
}

/**
 * A catalog ordered by name, as filter options and an id to name lookup.
 * Retired rows are included. Suspends until the catalog is loaded.
 */
export function useCatalogOptions(catalog: CatalogDescriptor): CatalogOptions {
	const result = useLiveSuspenseQuery((query) =>
		query
			.from({ row: catalog.collection() })
			.orderBy(({ row }) => catalogName(catalog, row), 'asc')
			.select(({ row }) => ({ id: row.id, label: catalogName(catalog, row) })),
	);

	return indexed(result.data);
}

/** Indexes the options by id. */
export function indexed(options: readonly FilterOption[]): CatalogOptions {
	return { options, nameById: new Map(options.map((row) => [row.id, row.label] as const)) };
}
