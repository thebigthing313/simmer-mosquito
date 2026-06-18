import { type Collection, eq, useLiveSuspenseQuery } from '@tanstack/react-db';
import { assertEagerCollection } from '../lib/assert-eager-collection';

interface NamedLifecycleRow {
	readonly isActive: boolean;
	readonly name: string;
}

export function useActiveNamedCollectionRows<TRow extends NamedLifecycleRow>(
	collection: Collection<TRow, string | number>,
): {
	readonly activeRows: readonly TRow[];
	readonly inactiveRows: readonly TRow[];
} {
	assertEagerCollection(collection, 'useActiveNamedCollectionRows');
	const namedCollection = collection as unknown as Collection<NamedLifecycleRow, string | number>;
	const activeResult = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ row: namedCollection })
				.where(({ row }) => eq(row.isActive, true))
				.orderBy(({ row }) => row.name, 'asc'),
		[namedCollection],
	);
	const inactiveResult = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ row: namedCollection })
				.where(({ row }) => eq(row.isActive, false))
				.orderBy(({ row }) => row.name, 'asc'),
		[namedCollection],
	);

	return {
		activeRows: activeResult.data as unknown as readonly TRow[],
		inactiveRows: inactiveResult.data as unknown as readonly TRow[],
	};
}
