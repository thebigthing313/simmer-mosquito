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
					.from({ item: tag_items() })
					.where(({ item }) => eq(item.entity_id, entityId))
					// `inner`, and passed rather than left to the default, which is `left`:
					// an assignment whose catalog row this client does not hold has no name
					// and no colour to draw, and a chip reading "Unknown tag" reads as a
					// broken record rather than as one still arriving.
					.join({ tag: tags() }, ({ item, tag }) => eq(item.tag_id, tag.id), 'inner')
					.orderBy(({ tag }) => tag.tag_name, 'asc')
					// The `coalesce` calls are what make this compile. The builder types a
					// joined column as possibly absent whatever the join kind, and `Tag`
					// requires a name, so deleting one fails `tsc` on the widened type.
					// The fallbacks they name are not reachable: an `inner` join emits only
					// matched pairs, so nothing here ever renders "Unknown tag".
					// `item.tag_id` is the same uuid as `tag.id`, which is why the id needs
					// no invented stand-in.
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
