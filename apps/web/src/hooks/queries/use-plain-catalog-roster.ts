import { useLiveSuspenseQuery } from '@tanstack/react-db';
import type { collection_lures } from '../../lib/collections/collection_lures';
import type { CatalogListing } from './catalog-roster-view';

/** A catalog with no custom schema, as a record form picks from it. */
export function usePlainCatalogRoster(
	collection: ReturnType<typeof collection_lures>,
): readonly CatalogListing[] {
	const result = useLiveSuspenseQuery((query) =>
		query.from({ row: collection }).select(({ row }) => ({
			id: row.id,
			name: row.name,
			isActive: row.is_active,
		})),
	);

	return result.data;
}
