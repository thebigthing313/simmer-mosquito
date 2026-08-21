/**
 * The Tags on one record.
 *
 * A map card's tags, and a detail page's. One query: `tag_items` joined to the
 * catalog, so a tag arrives named and coloured rather than as an id to look up.
 *
 * A sibling of the surface's own query rather than part of it. It is keyed on the
 * record id the page already has, so it starts on the same render — there is
 * nothing to wait for and nothing to fold in. Tags are also one-to-many, which a
 * nested projection cannot carry the way the address does.
 *
 * `tag_items.entity_id` is globally unique across every taggable table, so a
 * single-id lookup needs no entity-type discriminator. Compare
 * `components/explorer/use-entity-tags.ts`, which does take one — because it asks
 * about a page of records at once and the type is what bounds that subset.
 */

import { coalesce, eq, useLiveQuery } from '@tanstack/react-db';
import { tag_items } from '../../lib/collections/tag_items';
import { tags } from '../../lib/collections/tags';
import { mapCardGcTimeMs } from './shared';
import type { Tag } from './tag-view';

export function useRecordTags(entityId: string): readonly Tag[] {
	const result = useLiveQuery(
		{
			gcTime: mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ item: tag_items })
					.where(({ item }) => eq(item.entity_id, entityId))
					// `inner`: an assignment names a tag that exists. A row whose tag had been
					// deleted is not a blank chip, it is nothing to show.
					.join({ tag: tags }, ({ item, tag }) => eq(item.tag_id, tag.id))
					.orderBy(({ tag }) => tag.tag_name, 'asc')
					// Coalesced even though the join is `inner`: the builder types every
					// joined column as possibly absent, which is honest — the catalog row can
					// still be arriving. `item.tag_id` is the same uuid and cannot be null, so
					// the id needs no invented fallback.
					.select(({ item, tag }) => ({
						id: coalesce(tag.id, item.tag_id),
						name: coalesce(tag.tag_name, 'Unknown tag'),
						color: coalesce(tag.color, null),
						description: coalesce(tag.description, null),
					})),
		},
		[entityId],
	);

	return result.data;
}
