import type { TagItemRow, TagRow } from '@simmer-mosquito/sync';
import { and, eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { useCollectionRows } from '../../hooks/use-collection-rows';
import { webCollections } from '../../sync/webCollections';

// `tag_items` is on-demand; keep the current page's tags warm briefly on unmount
// so paging back and forth does not refetch them.
const TAG_ITEMS_GC_MS = 30_000;
// Keeps the IN predicate valid (and matching nothing) when the page is empty.
const NO_MATCH_ID = '00000000-0000-0000-0000-000000000000';

/**
 * The tags attached to a page of records, keyed by record id.
 *
 * Scoped to the ids actually on screen rather than the whole window: `tag_items`
 * is an on-demand subset, and a request naming every record in a wide date range
 * exceeds the URL limit and fails.
 */
export function useEntityTags(
	entityType: string,
	entityIds: readonly string[],
): ReadonlyMap<string, readonly TagRow[]> {
	const { rows: tags } = useCollectionRows<TagRow>(webCollections.tags);
	const tagById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);

	const uniqueIds = useMemo(() => [...new Set(entityIds)], [entityIds]);
	const queryIds = uniqueIds.length > 0 ? uniqueIds : [NO_MATCH_ID];
	const idsKey = uniqueIds.join(',');

	const result = useLiveQuery(
		{
			gcTime: TAG_ITEMS_GC_MS,
			query: (query) =>
				query
					.from({ item: webCollections.tagItems })
					.where(({ item }) =>
						and(eq(item.entityType, entityType), inArray(item.entityId, queryIds)),
					),
		},
		[idsKey, entityType],
	);

	return useMemo(() => {
		const byEntity = new Map<string, TagRow[]>();
		for (const item of (result.data ?? []) as readonly TagItemRow[]) {
			const tag = tagById.get(item.tagId);
			if (tag === undefined) {
				continue;
			}
			const list = byEntity.get(item.entityId) ?? [];
			if (!list.some((existing) => existing.id === tag.id)) {
				list.push(tag);
			}
			byEntity.set(item.entityId, list);
		}
		for (const list of byEntity.values()) {
			list.sort((first, second) => first.tagName.localeCompare(second.tagName));
		}
		return byEntity;
	}, [result.data, tagById]);
}
