import { eq, useLiveSuspenseQuery } from '@tanstack/react-db';
import { tags } from '../../lib/collections/tags';
import type { TagRecord } from './use-tag-catalog';
/** The Tags on one side of the lifecycle split, with colour and description, in name order. */
export function useTagHalf(isActive: boolean): readonly TagRecord[] {
	return useLiveSuspenseQuery((query) =>
		query
			.from({ tag: tags() })
			.where(({ tag }) => eq(tag.is_active, isActive))
			.orderBy(({ tag }) => tag.tag_name, 'asc')
			.select(({ tag }) => ({
				id: tag.id,
				name: tag.tag_name,
				description: tag.description,
				color: tag.color,
				isActive: tag.is_active,
			})),
	).data;
}
