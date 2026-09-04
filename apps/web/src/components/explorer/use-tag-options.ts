import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import type { Tag } from '../../hooks/queries/tag-view';
import { tags } from '../../lib/collections/tags';
import type { FilterOption } from './multi-select-filter';

/**
 * The agency's Tags, as filter options and as an id→Tag lookup.
 *
 * The lookup is the whole Tag rather than its name, because a removable filter
 * chip is tinted with the tag's own colour — a tag filter that lost the colour
 * would read as a different thing from the chips on the rows below it.
 *
 * Inactive tags are included. An explorer filters records that were tagged in the
 * past, and a tag the agency has since retired is still on them.
 */
export function useTagOptions(): {
	readonly options: readonly FilterOption[];
	readonly byId: ReadonlyMap<string, Tag>;
} {
	const result = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ tag: tags() })
				.orderBy(({ tag }) => tag.tag_name, 'asc')
				.select(({ tag }) => ({
					id: tag.id,
					name: tag.tag_name,
					color: tag.color,
					description: tag.description,
				})),
		[],
	);

	const catalog = result.data;

	return useMemo(
		() => ({
			options: catalog.map((tag) => ({ id: tag.id, label: tag.name })),
			byId: new Map(catalog.map((tag) => [tag.id, tag] as const)),
		}),
		[catalog],
	);
}
