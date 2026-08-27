import { sql } from '@simmer-mosquito/db';
import { planItemPositions, positionBetween } from '@simmer-mosquito/domain';
import type { CommandTransaction } from './command-write.js';

/**
 * Ordering for the three item tables that carry a stop list: `route_items`,
 * `assignment_items` and `mission_items`.
 *
 * `position` is `double precision` in all three so that both writes are
 * minimal. An add takes a value between its two neighbours and nothing else
 * moves; a move rewrites the rows it moved and leaves every sibling alone. The
 * removes soft delete without renumbering, so gaps in `position` are normal and
 * mean nothing.
 *
 * The arithmetic itself is `planItemPositions` in `packages/domain`, because
 * the optimistic write in `apps/web` has to compute the same numbers. If the
 * two disagreed, every reorder would flicker when the real rows streamed back.
 */

export type OrderedItemTable = 'route_items' | 'assignment_items' | 'mission_items';
export type OrderedItemParentColumn = 'route_id' | 'assignment_id' | 'mission_id';

export type PlacementKind = 'start' | 'end' | 'before' | 'after';

/** One parent's active items: which table holds them and which parent they hang off. */
export interface OrderedItemList {
	readonly table: OrderedItemTable;
	readonly parentColumn: OrderedItemParentColumn;
	readonly parentId: string;
	readonly organizationId: string;
}

/**
 * A domain placement with its reference flattened.
 *
 * The three domain placement types name their reference differently
 * (`routeItemId`, `assignmentItemId`, `missionItemId`), so the `*PlacementRef`
 * helpers read it out and this is what the ordering works in.
 */
export interface ItemPlacement {
	readonly kind: PlacementKind;
	readonly refId: string | null;
}

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
 * The position for a row about to be inserted into `list`.
 *
 * Reads the siblings once and resolves the placement with `applyPlacement`, the
 * same function the moves order by, so an add and a move of the same placement
 * agree on where the row goes. Reading the list is one query; the write is the
 * insert alone.
 *
 * The read takes no row lock. Two appends racing each other both compute the
 * same `max + 1` and tie, and `created_at` breaks the tie, so the list is still
 * an order. Locking the whole list on every add would put back the contention
 * the single-row write removed.
 */
export async function nextItemPosition(
	trx: CommandTransaction,
	list: OrderedItemList,
	newItemId: string,
	placement: ItemPlacement,
): Promise<number> {
	const rows = await trx
		.selectFrom(list.table)
		.select(['id', 'position'])
		.where(list.parentColumn, '=', list.parentId)
		.where('organization_id', '=', list.organizationId)
		.where('deleted_at', 'is', null)
		.orderBy('position', 'asc')
		.orderBy('created_at', 'asc')
		.execute();
	const positions = new Map(rows.map((row) => [row.id, row.position]));
	const ordered = applyPlacement(
		[...rows.map((row) => row.id), newItemId],
		[newItemId],
		placement.kind,
		placement.refId,
	);
	const index = ordered.indexOf(newItemId);
	const before = index > 0 ? (positions.get(ordered[index - 1] as string) ?? null) : null;
	const after =
		index < ordered.length - 1 ? (positions.get(ordered[index + 1] as string) ?? null) : null;
	return positionBetween(before, after);
}

/**
 * Move `movingIds` to `placement` within `list`, writing only the rows that
 * moved.
 *
 * Reads the siblings once, resolves the order with `applyPlacement` (so a move
 * and an add of the same placement agree on where the row goes), then asks
 * `planItemPositions` which rows to write. Answers with the positions it wrote,
 * which is one entry per moved id on the normal path.
 *
 * When the gap between the moved run's anchors cannot hold it at `double
 * precision`, the plan renumbers every active item instead and this writes all
 * of them. That normalization happens inside the caller's transaction, which is
 * what all three domain docs allow in place of a public normalization command.
 */
export async function moveItems(
	trx: CommandTransaction,
	list: OrderedItemList,
	movingIds: readonly string[],
	placement: ItemPlacement,
	actorProfileId: string,
): Promise<ReadonlyMap<string, number>> {
	const rows = await trx
		.selectFrom(list.table)
		.select(['id', 'position'])
		.where(list.parentColumn, '=', list.parentId)
		.where('organization_id', '=', list.organizationId)
		.where('deleted_at', 'is', null)
		.orderBy('position', 'asc')
		.orderBy('created_at', 'asc')
		.execute();
	const ordered = applyPlacement(
		rows.map((row) => row.id),
		movingIds,
		placement.kind,
		placement.refId,
	);
	const plan = planItemPositions(
		ordered,
		new Map(rows.map((row) => [row.id, row.position])),
		movingIds,
	);
	for (const [id, position] of plan.positions) {
		await trx
			.updateTable(list.table)
			.set({ position, updated_by_profile_id: actorProfileId, updated_at: sql`now()` })
			.where('id', '=', id)
			.where('organization_id', '=', list.organizationId)
			.execute();
	}
	return plan.positions;
}
