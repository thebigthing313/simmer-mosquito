import type { Collection } from '@tanstack/db';
import { useEffect, useState } from 'react';

export function useCollectionRows<TRow extends object>(
	collection: Collection<TRow, string | number>,
): {
	readonly rows: readonly TRow[];
	readonly status: string;
} {
	const [snapshot, setSnapshot] = useState(() => ({
		rows: collection.toArray,
		status: collection.status,
	}));

	useEffect(() => {
		let cancelled = false;

		function refresh() {
			if (!cancelled) {
				setSnapshot({
					rows: collection.toArray,
					status: collection.status,
				});
			}
		}

		const subscription = collection.subscribeChanges(refresh, {
			includeInitialState: true,
		});

		return () => {
			cancelled = true;
			subscription.unsubscribe();
		};
	}, [collection]);

	return snapshot;
}
