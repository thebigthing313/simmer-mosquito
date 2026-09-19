import { eq, useLiveSuspenseQuery } from '@tanstack/react-db';
import type { collection_lures } from '../../lib/collections/collection_lures';
import type { DescribedCatalogRecord } from './catalog-record-view';

/** A name-and-description catalog on one side of the lifecycle split, in name order. */
export function useDescribedHalf(
	collection: ReturnType<typeof collection_lures>,
	isActive: boolean,
): readonly DescribedCatalogRecord[] {
	return useLiveSuspenseQuery((query) =>
		query
			.from({ row: collection })
			.where(({ row }) => eq(row.is_active, isActive))
			.orderBy(({ row }) => row.name, 'asc')
			.select(({ row }) => ({
				id: row.id,
				name: row.name,
				description: row.description,
				isActive: row.is_active,
			})),
	).data;
}
