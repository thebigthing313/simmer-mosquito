/**
 * Reordering an ordered list of stops.
 *
 * Routes, assignments, and mission items all store a `position` and reorder through
 * a dedicated command endpoint that takes a *declarative placement* rather than
 * computed positions. The server resolves the active sequence and writes only
 * the rows that moved, inside one transaction.
 *
 * That leaves the client three jobs per move: say where the item should land,
 * show it there immediately, and write the same positions the server will write.
 * {@link planMove} does the first two, returning the placement to send and the id
 * order to render until sync catches up. {@link planStopPositions} does the third,
 * through the same arithmetic the server runs.
 *
 * The anchor is named `anchorId` rather than `routeItemId`/`assignmentItemId` so
 * this module names no one table; each feature renames it at its own fetch
 * boundary, where the wire vocabulary actually belongs.
 */

import { type ItemPositions, planItemPositions } from '@simmer-mosquito/domain';

export type MoveAction = 'up' | 'down' | 'top' | 'bottom';

export type OrderPlacement =
	| { readonly kind: 'start' }
	| { readonly kind: 'end' }
	| { readonly kind: 'before'; readonly anchorId: string }
	| { readonly kind: 'after'; readonly anchorId: string };

export interface MovePlan {
	/** The full id order to display until the server's reindex streams back. */
	readonly order: readonly string[];
	/** The id being moved — what the caller sends as the (single-element) selection. */
	readonly movedId: string;
	readonly placement: OrderPlacement;
}

/**
 * Plan a single-item move within `ids`.
 *
 * Returns `null` when the move is a no-op (moving the first item up, the last item
 * down, or an index that isn't in the list), so callers can skip the round trip
 * entirely rather than sending a placement the server would resolve to nothing.
 */
export function planMove(
	ids: readonly string[],
	index: number,
	action: MoveAction,
): MovePlan | null {
	const moved = ids[index];
	if (moved === undefined) {
		return null;
	}
	const rest = ids.filter((_, position) => position !== index);

	switch (action) {
		case 'up': {
			if (index === 0) {
				return null;
			}
			const anchorId = ids[index - 1] as string;
			const order = [...ids];
			order.splice(index, 1);
			order.splice(index - 1, 0, moved);
			return { order, movedId: moved, placement: { kind: 'before', anchorId } };
		}
		case 'down': {
			if (index >= ids.length - 1) {
				return null;
			}
			const anchorId = ids[index + 1] as string;
			const order = [...ids];
			order.splice(index, 1);
			order.splice(index + 1, 0, moved);
			return { order, movedId: moved, placement: { kind: 'after', anchorId } };
		}
		case 'top': {
			if (index === 0) {
				return null;
			}
			return { order: [moved, ...rest], movedId: moved, placement: { kind: 'start' } };
		}
		case 'bottom': {
			if (index >= ids.length - 1) {
				return null;
			}
			return { order: [...rest, moved], movedId: moved, placement: { kind: 'end' } };
		}
	}
}

/**
 * The rows the optimistic half of a move writes, and the `position` each takes.
 *
 * `positionOf` reads a stop's current position out of the collection the caller
 * is writing to. The arithmetic is `planItemPositions`, the function the server
 * runs on the same move, so the rows written here and the rows that stream back
 * carry the same numbers and nothing shifts twice on screen.
 *
 * A stop the collection has not got is left out of the input, which sends the
 * plan down its normalize path and writes the whole list. That is the same
 * answer the server would reach from a list it could not subdivide, and sync
 * corrects it either way.
 */
export function planStopPositions(
	plan: MovePlan,
	positionOf: (id: string) => number | undefined,
): ItemPositions {
	const positions = new Map<string, number>();
	for (const id of plan.order) {
		const position = positionOf(id);
		if (position !== undefined) {
			positions.set(id, position);
		}
	}
	return planItemPositions(plan.order, positions, [plan.movedId]).positions;
}
