/**
 * The `position` arithmetic behind an ordered stop list.
 *
 * Route items, assignment items and mission items all store `position` as
 * `double precision` so that adding or moving a stop writes only the rows that
 * moved. This module is the arithmetic and nothing else: no table, no
 * transaction, no React. It lives here because the server and the optimistic
 * write in `apps/web` have to agree on the number, and two copies would drift
 * the first time either side was tuned.
 */

/** One active item's current `position`, keyed by id. */
export type ItemPositions = ReadonlyMap<string, number>;

export interface ItemPositionPlan {
	/** The rows to write, and the `position` each takes. Everything else is left alone. */
	readonly positions: ItemPositions;
	/**
	 * True when the gap could not hold the run and every active item was
	 * renumbered instead. `positions` then covers the whole list.
	 */
	readonly normalized: boolean;
}

/**
 * The position a row takes between the two it lands between. Either neighbour
 * is null at the ends of the list, and both are null when the list is empty.
 *
 * No rebalancer, deliberately. Halving the gap between the same pair over and
 * over exhausts a `double precision` mantissa after about 50 inserts, which
 * needs 50 stops added between the same two stops of one route without either
 * of them moving. A route is tens of stops edited by hand; nothing gets near
 * it. A move that cannot fit its run has {@link planItemPositions} to fall back
 * on, which an add does not need.
 */
export function positionBetween(before: number | null, after: number | null): number {
	if (before === null && after === null) {
		return 0;
	}
	if (before === null) {
		// Head of the list. Halving keeps the value positive, but legacy rows are
		// integers from zero, so a non-positive minimum has to step down instead.
		const first = after as number;
		return first > 0 ? first / 2 : first - 1;
	}
	if (after === null) {
		return before + 1;
	}
	return (before + after) / 2;
}

/**
 * The rows a move writes, given the order it resolved to.
 *
 * `order` is the full active id list *after* the placement is applied, and
 * `positions` is what those rows hold right now. The moved ids land as one
 * contiguous run, so the run is subdivided out of the gap between the last
 * unmoved id before it and the first unmoved id after it. Every other row keeps
 * the position it has, which is the whole point: moving one stop in a route of
 * forty writes one row.
 *
 * N moved ids need N distinct values out of one gap, so unlike the add path
 * this is a place where a gap can genuinely run out of room. When it does, the
 * plan renumbers every active item 0…n-1 in the resolved order and says so
 * through `normalized`; the caller applies that inside the same transaction.
 *
 * A move that resolves to the order the list is already in still rewrites its
 * moved rows. Deliberate: a plan with no rows in it is an optimistic mutation
 * that sends no request at all, so "nothing to do" would read as a write that
 * silently did not happen. Only a move naming no id that is in the list plans
 * nothing.
 */
export function planItemPositions(
	order: readonly string[],
	positions: ItemPositions,
	movingIds: readonly string[],
): ItemPositionPlan {
	const moving = new Set(movingIds.filter((id) => order.includes(id)));
	if (moving.size === 0) {
		return { positions: new Map(), normalized: false };
	}
	const start = order.findIndex((id) => moving.has(id));
	let end = start;
	while (end + 1 < order.length && moving.has(order[end + 1] as string)) {
		end += 1;
	}
	const length = end - start + 1;
	if (length !== moving.size) {
		// The moved ids are not one run, so `order` did not come from a placement.
		// Renumbering is the only answer that still reads back in the right order.
		return normalize(order);
	}
	const before = start > 0 ? positions.get(order[start - 1] as string) : null;
	const after = end < order.length - 1 ? positions.get(order[end + 1] as string) : null;
	if (before === undefined || after === undefined) {
		return normalize(order);
	}
	const run = subdivide(before, after, length);
	if (run === null) {
		return normalize(order);
	}
	return {
		positions: new Map(run.map((position, index) => [order[start + index] as string, position])),
		normalized: false,
	};
}

function normalize(order: readonly string[]): ItemPositionPlan {
	return { positions: new Map(order.map((id, index) => [id, index])), normalized: true };
}

/**
 * `count` strictly increasing values between the two anchors, or null when the
 * gap cannot hold them at `double precision`.
 *
 * Both open ends walk {@link positionBetween} outward, so a run appended to a
 * list numbers 5, 6, 7 exactly as three separate adds would. A closed gap is
 * split evenly instead, because halving repeatedly would crowd the run against
 * one anchor and burn the mantissa faster than it needs to.
 */
function subdivide(before: number | null, after: number | null, count: number): number[] | null {
	const run: number[] = [];
	if (after === null) {
		let previous = before;
		for (let index = 0; index < count; index += 1) {
			previous = positionBetween(previous, null);
			run.push(previous);
		}
	} else if (before === null) {
		let next = after;
		for (let index = 0; index < count; index += 1) {
			next = positionBetween(null, next);
			run.unshift(next);
		}
	} else {
		const step = (after - before) / (count + 1);
		for (let index = 1; index <= count; index += 1) {
			run.push(before + step * index);
		}
	}
	return fits(run, before, after) ? run : null;
}

/** Strictly increasing, and strictly inside whichever anchors exist. */
function fits(run: readonly number[], before: number | null, after: number | null): boolean {
	let previous = before;
	for (const value of run) {
		if (!Number.isFinite(value) || (previous !== null && value <= previous)) {
			return false;
		}
		previous = value;
	}
	return after === null || (previous as number) < after;
}
