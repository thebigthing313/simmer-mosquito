import type { TagItemRow, TagRow } from '@simmer-mosquito/sync';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { webCollections } from '../sync/webCollections';

const gcTimeMs = 30_000;

/**
 * The tags assigned to a taggable record (habitat, trap, address, region, service
 * request), resolved off the eager tags catalog. `tag_items.entity_id` is globally
 * unique, so a single-id lookup needs no entity-type discriminator. Returns the
 * tags sorted by name; empty while the on-demand `tag_items` subset is still warming.
 */
export function useMapCardTags(entityId: string): readonly TagRow[] {
	const itemsResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ item: webCollections.tagItems })
					.where(({ item }) => eq(item.entityId, entityId)),
		},
		[entityId],
	);
	const catalogResult = useLiveQuery((query) => query.from({ tag: webCollections.tags }), []);

	return useMemo(() => {
		const tagById = new Map((catalogResult.data ?? []).map((tag) => [tag.id, tag as TagRow]));
		return ((itemsResult.data ?? []) as readonly TagItemRow[])
			.flatMap((item) => {
				const tag = tagById.get(item.tagId);
				return tag === undefined ? [] : [tag];
			})
			.sort((first, second) => first.tagName.localeCompare(second.tagName));
	}, [itemsResult.data, catalogResult.data]);
}
