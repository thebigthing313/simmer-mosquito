import type { InitialQueryBuilder } from '@tanstack/db';
import { eq, useLiveSuspenseQuery } from '@tanstack/react-db';
import type { CatalogRecords, NamedCatalogRecord } from './catalog-record-view';
import { type CatalogDescriptor, catalogName } from './catalog-register';

/** One side of the lifecycle split, in name order, with the fields the page edits. */
function lifecycleHalf(catalog: CatalogDescriptor, isActive: boolean) {
	return (query: InitialQueryBuilder) =>
		query
			.from({ row: catalog.collection() })
			.where(({ row }) => eq(row.is_active, isActive))
			.orderBy(({ row }) => catalogName(catalog, row), 'asc')
			.select(({ row }) => ({
				id: row.id,
				name: catalogName(catalog, row),
				isActive: row.is_active,
				...catalog.recordFields(row),
			}));
}

/**
 * A catalog as its management page maintains it: the active rows and the
 * retired rows, each in name order, with every field the dialog edits.
 * Suspends until the catalog is loaded.
 */
export function useCatalogRecords<TRecord extends object>(
	catalog: CatalogDescriptor<TRecord, object>,
): CatalogRecords<NamedCatalogRecord & TRecord> {
	const active = useLiveSuspenseQuery(lifecycleHalf(catalog, true)).data;
	const inactive = useLiveSuspenseQuery(lifecycleHalf(catalog, false)).data;

	// The projection is the descriptor's, read through an erased row, so the
	// query cannot compute its type. `defineCatalog` did, where it was written.
	return {
		activeRecords: active as unknown as readonly (NamedCatalogRecord & TRecord)[],
		inactiveRecords: inactive as unknown as readonly (NamedCatalogRecord & TRecord)[],
	};
}
