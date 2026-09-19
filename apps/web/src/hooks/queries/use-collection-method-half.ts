import { eq, useLiveSuspenseQuery } from '@tanstack/react-db';
import { collection_methods } from '../../lib/collections/collection_methods';
import type { CollectionMethodRecord } from './catalog-record-view';

/** The organization's collection methods on one side of the lifecycle split, in name order. */
export function useCollectionMethodHalf(isActive: boolean): readonly CollectionMethodRecord[] {
	return useLiveSuspenseQuery((query) =>
		query
			.from({ row: collection_methods() })
			.where(({ row }) => eq(row.is_active, isActive))
			.orderBy(({ row }) => row.name, 'asc')
			.select(({ row }) => ({
				id: row.id,
				name: row.name,
				description: row.description,
				customSchema: row.custom_schema,
				actionThreshold: row.action_threshold,
				isActive: row.is_active,
			})),
	).data;
}
