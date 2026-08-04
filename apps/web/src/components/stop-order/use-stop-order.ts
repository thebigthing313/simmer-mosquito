import { useCallback, useEffect, useMemo, useState } from 'react';
import { type MoveAction, type OrderPlacement, planMove } from './plan-move';

/**
 * Optimistic ordering for a reorderable stop list.
 *
 * The server owns `position` and reindexes on every move, so a reordered list would
 * otherwise sit still until the shape stream caught up — long enough to read as a
 * dropped click. This hook keeps a `pendingOrder` overlay that sorts the synced rows
 * into the order the user just asked for, then drops the overlay once the synced
 * order agrees with it.
 *
 * `move` rethrows on failure after rolling the overlay back. Consumers already own a
 * single error banner covering their other writes, and a second error channel here
 * would mean a second banner saying the same kind of thing.
 */
export function useStopOrder<TItem>(input: {
	readonly items: readonly TItem[];
	readonly keyOf: (item: TItem) => string;
	/** Sends the move command. Must be stable — wrap it in `useCallback`. */
	readonly commit: (movedIds: readonly string[], placement: OrderPlacement) => Promise<void>;
}): {
	/** `items`, reordered by the pending overlay when one is active. */
	readonly ordered: readonly TItem[];
	readonly move: (index: number, action: MoveAction) => Promise<void>;
} {
	const { items, keyOf, commit } = input;
	const [pendingOrder, setPendingOrder] = useState<readonly string[] | null>(null);

	const ordered = useMemo(() => {
		if (pendingOrder === null) {
			return items;
		}
		const rank = new Map(pendingOrder.map((key, index) => [key, index]));
		return [...items].sort(
			(first, second) =>
				(rank.get(keyOf(first)) ?? Number.MAX_SAFE_INTEGER) -
				(rank.get(keyOf(second)) ?? Number.MAX_SAFE_INTEGER),
		);
	}, [items, pendingOrder, keyOf]);

	// Sync caught up: the synced order now matches what we optimistically showed, so
	// the overlay has nothing left to correct.
	useEffect(() => {
		if (pendingOrder === null) {
			return;
		}
		const current = items.map(keyOf);
		if (
			current.length === pendingOrder.length &&
			current.every((value, index) => value === pendingOrder[index])
		) {
			setPendingOrder(null);
		}
	}, [items, pendingOrder, keyOf]);

	const move = useCallback(
		async (index: number, action: MoveAction) => {
			const ids = ordered.map(keyOf);
			const plan = planMove(ids, index, action);
			if (plan === null) {
				return;
			}
			setPendingOrder(plan.order);
			try {
				await commit([plan.movedId], plan.placement);
			} catch (cause) {
				setPendingOrder(null);
				throw cause;
			}
		},
		[ordered, keyOf, commit],
	);

	return { ordered, move };
}
