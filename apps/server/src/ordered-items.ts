import type { CommandTransaction } from './command-write.js';

/**
 * Ordering for the three item tables that carry a stop list: `route_items`,
 * `assignment_items` and `mission_items`.
 *
 * `position` is `double precision` in all three so that adding a stop is a
 * single-row insert: the new row takes a value between its two neighbours and
 * nothing else moves. The removes already soft delete without renumbering, so
 * gaps in `position` are normal and mean nothing.
 *
 * The moves are the exception and still renumber. They take an id list, so
 * moving N stops writes N rows whatever the scheme, and consecutive integers
 * are the cheapest thing to write.
 */

export type OrderedItemTable = 'route_items' | 'assignment_items' | 'mission_items';
export type OrderedItemParentColumn = 'route_id' | 'assignment_id' | 'mission_id';

export type PlacementKind = 'start' | 'end' | 'before' | 'after';

/**
 * The order `orderedIds` takes once `movingIds` is placed. Ids not already in
 * the list are ignored, and a `before`/`after` whose reference is missing falls
 * through to the end.
 */
export function applyPlacement(
	orderedIds: readonly string[],
	movingIds: readonly string[],
	kind: PlacementKind,
	refId: string | null,
): readonly string[] {
	const moving = movingIds.filter((id) => orderedIds.includes(id));
	const remaining = orderedIds.filter((id) => !moving.includes(id));
	if (kind === 'start') {
		return [...moving, ...remaining];
	}
	if (kind === 'before' || kind === 'after') {
		const refIndex = refId === null ? -1 : remaining.indexOf(refId);
		if (refIndex !== -1) {
			const insertAt = kind === 'before' ? refIndex : refIndex + 1;
			return [...remaining.slice(0, insertAt), ...moving, ...remaining.slice(insertAt)];
		}
	}
	return [...remaining, ...moving];
}

/**
 * The position a row takes between the two it lands between. Either neighbour
 * is null at the ends of the list, and both are null when the list is empty.
 *
 * No rebalancer, deliberately. Halving the gap between the same pair over and
 * over exhausts a `double precision` mantissa after about 50 inserts, which
 * needs 50 stops added between the same two stops of one route without either
 * of them moving. A route is tens of stops edited by hand; nothing gets near
 * it. If it ever did, the midpoint would land on a neighbour's value and the
 * `position, created_at` ordering every reader uses puts the newer row second,
 * so the list stays deterministic rather than breaking.
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
 * The position for a row about to be inserted under `parentId`.
 *
 * Reads the siblings once and resolves the placement with `applyPlacement`, the
 * same function the moves order by, so an add and a move of the same placement
 * agree on where the row goes. Reading the list is one query; the write is the
 * insert alone.
 */
export async function nextItemPosition(
	trx: CommandTransaction,
	table: OrderedItemTable,
	parentColumn: OrderedItemParentColumn,
	parentId: string,
	organizationId: string,
	newItemId: string,
	kind: PlacementKind,
	refId: string | null,
): Promise<number> {
	const rows = await trx
		.selectFrom(table)
		.select(['id', 'position'])
		.where(parentColumn, '=', parentId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.orderBy('position', 'asc')
		.orderBy('created_at', 'asc')
		.execute();
	const positions = new Map(rows.map((row) => [row.id, row.position]));
	const ordered = applyPlacement(
		[...rows.map((row) => row.id), newItemId],
		[newItemId],
		kind,
		refId,
	);
	const index = ordered.indexOf(newItemId);
	const before = index > 0 ? (positions.get(ordered[index - 1] as string) ?? null) : null;
	const after =
		index < ordered.length - 1 ? (positions.get(ordered[index + 1] as string) ?? null) : null;
	return positionBetween(before, after);
}
