import { useState } from 'react';
import { type MoveAction, type MovePlan, planMove } from '../../components/stop-order/plan-move';

/**
 * Optimistic ordering for a reorderable stop list.
 *
 * Keeps a `pendingOrder` overlay that sorts the synced rows into the order just
 * asked for, then drops the overlay once the synced order agrees with it.
 * `move` rolls the overlay back and rethrows on failure. `commit` is handed the
 * whole plan, the moved id, the placement and the resulting `order`.
 */
export function useStopOrder<TItem>(input: {
	readonly items: readonly TItem[];
	readonly keyOf: (item: TItem) => string;
	/** Sends the move command. */
	readonly commit: (plan: MovePlan) => Promise<void>;
}): {
	/** `items`, reordered by the pending overlay when one is active. */
	readonly ordered: readonly TItem[];
	readonly move: (index: number, action: MoveAction) => Promise<void>;
} {
	const { items, keyOf, commit } = input;
	const [pendingOrder, setPendingOrder] = useState<readonly string[] | null>(null);

	// Sync caught up: the synced order now matches what we optimistically showed, so
	// the overlay has nothing left to correct. Dropped in the render that sees
	// it rather than an effect one later, which React re-renders before
	// committing; it is a write and not a derivation because a stale overlay
	// left in place would re-sort the next change that arrives from sync.
	if (pendingOrder !== null && isSameOrder(items.map(keyOf), pendingOrder)) {
		setPendingOrder(null);
	}

	const ordered = sortedByOverlay(items, keyOf, pendingOrder);

	const move = async (index: number, action: MoveAction) => {
		const ids = ordered.map(keyOf);
		const plan = planMove(ids, index, action);
		if (plan === null) {
			return;
		}
		setPendingOrder(plan.order);
		try {
			await commit(plan);
		} catch (cause) {
			setPendingOrder(null);
			throw cause;
		}
	};

	return { ordered, move };
}

function isSameOrder(current: readonly string[], pending: readonly string[]): boolean {
	return (
		current.length === pending.length && current.every((value, index) => value === pending[index])
	);
}

/** The synced rows in the order the overlay asked for, or as they arrived. */
function sortedByOverlay<TItem>(
	items: readonly TItem[],
	keyOf: (item: TItem) => string,
	pendingOrder: readonly string[] | null,
): readonly TItem[] {
	if (pendingOrder === null) {
		return items;
	}
	const rank = new Map(pendingOrder.map((key, index) => [key, index]));
	return [...items].sort(
		(first, second) =>
			(rank.get(keyOf(first)) ?? Number.MAX_SAFE_INTEGER) -
			(rank.get(keyOf(second)) ?? Number.MAX_SAFE_INTEGER),
	);
}
