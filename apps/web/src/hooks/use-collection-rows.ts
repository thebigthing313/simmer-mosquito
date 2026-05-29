import { type Collection, useLiveSuspenseQuery } from '@tanstack/react-db';
import { assertEagerCollection } from '../lib/assert-eager-collection';

export function useCollectionRows<TRow extends object>(
	collection: Collection<TRow, string | number>,
): {
	readonly rows: readonly TRow[];
	readonly status: string;
} {
	assertEagerCollection(collection, 'useCollectionRows');
	const result = useLiveSuspenseQuery((query) => query.from({ row: collection }), [collection]);

	return {
		rows: result.data,
		status: result.collection.status,
	};
}