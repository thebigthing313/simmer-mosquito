/**
 * The whole Tag catalog, as the tag picker lists it.
 *
 * Not `useTagCatalog`, which splits the catalog into its two lifecycle halves
 * for the management table and suspends. The picker wants one list with each
 * Tag's lifecycle and relevance on it, because which section a Tag draws in is a
 * question about both: an inactive Tag is never offered, whatever its relevant
 * set says, and it still draws where it is assigned.
 *
 * `useLiveQuery` rather than the suspense hook, so opening the dialog never
 * suspends the header it opens from. `tags` is eager, so the rows are already
 * in hand.
 */

import { useLiveQuery } from '@tanstack/react-db';
import { tags } from '../../lib/collections/tags';

/** A Tag as the picker's checklist draws one. */
export interface PickerTag {
	readonly id: string;
	readonly name: string;
	readonly color: string | null;
	readonly description: string | null;
	readonly isActive: boolean;
	/** Empty means suggested for every record. See `lib/tag-relevance.ts`. */
	readonly relevantEntityTypes: readonly string[];
}

/** Every Tag the Organization has, in name order. */
export function useTagPickerCatalog(): readonly PickerTag[] {
	return useLiveQuery((query) =>
		query
			.from({ tag: tags() })
			.orderBy(({ tag }) => tag.tag_name, 'asc')
			.select(({ tag }) => ({
				id: tag.id,
				name: tag.tag_name,
				color: tag.color,
				description: tag.description,
				isActive: tag.is_active,
				relevantEntityTypes: tag.relevant_entity_types,
			})),
	).data;
}
