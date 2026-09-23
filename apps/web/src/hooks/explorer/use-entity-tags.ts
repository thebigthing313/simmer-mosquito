import { and, coalesce, eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { tag_items } from '../../lib/collections/tag_items';
import { tags } from '../../lib/collections/tags';
import { unmatchableId } from '../queries/shared';
import type { Tag } from '../queries/tag-view';

// `tag_items` is on-demand; keep the current page's tags warm briefly on unmount
// so paging back and forth does not refetch them.
const TAG_ITEMS_GC_MS = 30_000;

/**
 * The tags attached to a page of records, keyed by record id.
 *
 * Reads `tag_items` for the ids given, joined to the tag catalog, so each
 * assignment arrives named and coloured. `isReady` tells "no tags" from "not yet".
 */
export function useEntityTags(
	entityType: string,
	entityIds: readonly string[],
): {
	readonly byId: ReadonlyMap<string, readonly Tag[]>;
	/**
	 * Whether the subset has settled. A list that shows tags alongside other
	 * per-row detail needs this to tell "no tags" from "not yet"; otherwise every
	 * row flashes untagged on the way in.
	 */
	readonly isReady: boolean;
} {
	const uniqueIds = [...new Set(entityIds)];

	const result = useLiveQuery({
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
				// catalog row this client does not hold has no chip to draw. Safe
				// against #1026's cold-page rule for the reason recorded there too:
				// `tags` is eager, so it is never lazy-loaded, and every `tag_items`
				// subset carries the page's ids (#1028).
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
	});

	const assignments = result.data;
	const isReady = result.isReady;

	return { byId: groupByEntity(assignments), isReady };
}

/** The assignments the query returned, gathered under the record each is on. */
function groupByEntity(
	assignments: readonly ({ readonly entityId: string } & Tag)[],
): ReadonlyMap<string, readonly Tag[]> {
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
}
