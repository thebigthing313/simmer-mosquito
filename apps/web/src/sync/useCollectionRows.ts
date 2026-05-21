import { type Collection, eq, useLiveSuspenseQuery } from '@tanstack/react-db';

interface NamedLifecycleRow {
	readonly isActive: boolean;
	readonly name: string;
}

export function useCollectionRows<TRow extends object>(
	collection: Collection<TRow, string | number>,
): {
	readonly rows: readonly TRow[];
	readonly status: string;
} {
	const result = useLiveSuspenseQuery((query) => query.from({ row: collection }), [collection]);

	return {
		rows: result.data,
		status: result.collection.status,
	};
}

export function useActiveNamedCollectionRows<TRow extends NamedLifecycleRow>(
	collection: Collection<TRow, string | number>,
): {
	readonly activeRows: readonly TRow[];
	readonly inactiveRows: readonly TRow[];
} {
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
