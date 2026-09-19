import type { Collection } from '@tanstack/db';
import { count, eq, useLiveQuery } from '@tanstack/react-db';

/** The active row count of one eager catalog, as a `count()` aggregate. */
export function useActiveCount<TRow extends { readonly id: string; readonly is_active: boolean }>(
	collection: Collection<TRow, string | number>,
): number {
	const result = useLiveQuery((query) =>
		query
			.from({ row: collection })
			.where(({ row }) => eq(row.is_active, true))
			.select(({ row }) => ({ total: count(row.id) })),
	);

	// An aggregate with no `groupBy` is one row; it is absent only before the
	// first result, which for an eager catalog is the frame before it renders.
	return (result.data[0]?.total as number | undefined) ?? 0;
}
