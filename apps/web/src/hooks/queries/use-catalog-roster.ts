import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { type CatalogDescriptor, catalogName } from './catalog-register';
import type { CatalogListing } from './catalog-roster-view';

/**
 * A catalog as a record form picks from it: every row, retired ones included,
 * with the fields the form reads. Unordered, because `lifecycleOptions` sorts
 * it. Suspends until the catalog is loaded.
 */
export function useCatalogRoster<TListing extends object>(
	catalog: CatalogDescriptor<object, TListing>,
): readonly (CatalogListing & TListing)[] {
	const rows = useLiveSuspenseQuery((query) =>
		query.from({ row: catalog.collection() }).select(({ row }) => ({
			id: row.id,
			name: catalogName(catalog, row),
			isActive: row.is_active,
			...catalog.listingFields(row),
		})),
	).data;

	// The projection is the descriptor's, read through an erased row, so the
	// query cannot compute its type. `defineCatalog` did, where it was written.
	return rows as unknown as readonly (CatalogListing & TListing)[];
}
