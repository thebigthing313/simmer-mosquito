import { and, coalesce, eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { unmatchableId } from '../../hooks/queries/shared';
import type { Tag } from '../../hooks/queries/tag-view';
import { tag_items } from '../../lib/collections/tag_items';
import { tags } from '../../lib/collections/tags';

// `tag_items` is on-demand; keep the current page's tags warm briefly on unmount
// so paging back and forth does not refetch them.
const TAG_ITEMS_GC_MS = 30_000;

/**
 * The tags attached to a page of records, keyed by record id.
 *
 * Scoped to the ids actually on screen rather than the whole window: `tag_items`
 * is an on-demand subset, and a request naming every record in a wide date range
 * exceeds the URL limit and fails.
 *
 * One query — the catalog is joined, so each assignment arrives already named and
 * coloured. What is left in the memo is the grouping by record, which a query
 * cannot return: it hands back rows, not a lookup of them.
 */
export function useEntityTags(
	entityType: string,
	entityIds: readonly string[],
): {
	readonly byId: ReadonlyMap<string, readonly Tag[]>;
	/**
	 * Whether the subset has settled. A list that shows tags alongside other
	 * per-row detail needs this to tell "no tags" from "not yet" — otherwise every
	 * row flashes untagged on the way in.
	 */
	readonly isReady: boolean;
} {
	const uniqueIds = useMemo(() => [...new Set(entityIds)], [entityIds]);
	const idsKey = uniqueIds.join(',');

	const result = useLiveQuery(
		{
			gcTime: TAG_ITEMS_GC_MS,
			query: (query) =>
				query
					.from({ item: tag_items() })
					.where(({ item }) =>
						and(
							eq(item.entity_type, entityType),
							// An id no row has keeps the `IN` predicate valid, and empty, while
							// the page is still loading.
							inArray(item.entity_id, uniqueIds.length > 0 ? uniqueIds : [unmatchableId]),
						),
					)
					// `inner`, and passed rather than left to the default, which is `left`,
					// for the reason recorded in `use-record-tags.ts`: an assignment whose
					// catalog row this client does not hold has no chip to draw.
					.join({ tag: tags() }, ({ item, tag }) => eq(item.tag_id, tag.id), 'inner')
					.orderBy(({ tag }) => tag.tag_name, 'asc')
					// The `coalesce` calls are what make this compile, for the reason
					// recorded in `use-record-tags.ts`: a joined column types as possibly
					// absent whatever the join kind, `Tag` requires a name, and deleting one
					// fails `tsc`. Under `inner` the fallbacks they name never reach a row.
					.select(({ item, tag }) => ({
						entityId: item.entity_id,
						id: coalesce(tag.id, item.tag_id),
						name: coalesce(tag.tag_name, 'Unknown tag'),
						color: coalesce(tag.color, null),
						description: coalesce(tag.description, null),
					})),
		},
		[idsKey, entityType],
	);

	const assignments = result.data;
	const isReady = result.isReady;

	const byId = useMemo(() => {
		const byEntity = new Map<string, Tag[]>();
		for (const { entityId, ...tag } of assignments) {
			const list = byEntity.get(entityId) ?? [];
			// A record can carry the same tag only once, but an optimistic row and its
			// synced twin are two assignments of it for as long as the write is in
			// flight, and two identical chips is a visible flicker.
			if (!list.some((existing) => existing.id === tag.id)) {
				list.push(tag);
			}
			byEntity.set(entityId, list);
		}
		return byEntity;
	}, [assignments]);

	return { byId, isReady };
}
