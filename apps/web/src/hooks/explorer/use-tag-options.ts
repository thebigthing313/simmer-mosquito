import { useLiveSuspenseQuery } from '@tanstack/react-db';
import type { FilterOption } from '../../components/explorer/multi-select-filter';
import { tags } from '../../lib/collections/tags';
import type { Tag } from '../queries/tag-view';

/**
 * The organization's Tags, as filter options and as an id to Tag lookup.
 * Inactive tags are included.
 */
export function useTagOptions(): {
	readonly options: readonly FilterOption[];
	readonly byId: ReadonlyMap<string, Tag>;
} {
	const result = useLiveSuspenseQuery((query) =>
		query
			.from({ tag: tags() })
			.orderBy(({ tag }) => tag.tag_name, 'asc')
			.select(({ tag }) => ({
				id: tag.id,
				name: tag.tag_name,
				color: tag.color,
				description: tag.description,
			})),
	);

	const catalog = result.data;

	return {
		options: catalog.map((tag) => ({ id: tag.id, label: tag.name })),
		byId: new Map(catalog.map((tag) => [tag.id, tag] as const)),
	};
}
