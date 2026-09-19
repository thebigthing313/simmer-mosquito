import { and, eq, inArray, isNull, useLiveQuery } from '@tanstack/react-db';
import { targetTypeOf } from '../../components/operations/assignments/assignment-data';
import { collections } from '../../lib/collections/collections';
import { activityGcTimeMs, unmatchableId } from '../queries/shared';
import type { AssignmentItemView } from './use-assignment-items';

/** The stops' trap ids, deduped and sorted so the subset key is stable. */
function trapIdsOf(items: readonly AssignmentItemView[]): string[] {
	const ids = new Set<string>();
	for (const item of items) {
		if (targetTypeOf(item.entityType) === 'trap') {
			ids.add(item.entityId);
		}
	}
	return [...ids].sort();
}

/** Trap id to the first open collection on it, over the rows the subset returned. */
function firstCollectionByTrapId(
	rows: readonly { readonly id: string; readonly trapId: string | null }[],
): ReadonlyMap<string, string> {
	const map = new Map<string, string>();
	for (const collection of rows) {
		if (collection.trapId !== null && !map.has(collection.trapId)) {
			map.set(collection.trapId, collection.id);
		}
	}
	return map;
}

/**
 * The first open collection on each trap this worklist stops at, keyed by
 * trap id, over the `collections` subset for those traps.
 */
export function usePendingTrapCollections(
	items: readonly AssignmentItemView[],
): ReadonlyMap<string, string> {
	const trapIds = trapIdsOf(items);

	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ collection: collections() })
				.where(({ collection }) =>
					and(
						inArray(collection.trap_id, trapIds.length > 0 ? trapIds : [unmatchableId]),
						// The pending state, spelled out: a date-plus-duration collection
						// also has a null `collected_at` and is not waiting for anybody.
						// `isNull`, not `eq(…, null)` — the query builder follows SQL
						// three-valued logic, so an equality test against null matches
						// nothing and every trap stop silently looks like a first visit.
						isNull(collection.collected_at),
						eq(collection.collection_timing_mode, 'exact_timestamps'),
					),
				)
				.select(({ collection }) => ({ id: collection.id, trapId: collection.trap_id })),
	});

	return firstCollectionByTrapId(result.data);
}
