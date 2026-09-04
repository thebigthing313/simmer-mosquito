/**
 * The Tag catalog, as the page that maintains it needs both halves.
 *
 * `useTagOptions` is the other read and answers a different question: which Tags
 * a filter may offer, in one flat list including retired ones, because an
 * explorer filters records that were tagged in the past. This is where the
 * catalog is *defined*, so it carries the colour and the description the dialog
 * edits, and it splits the lifecycle the way the page is laid out.
 *
 * Two queries rather than one list the page partitions, for the reason
 * `use-catalog-records.ts` records: `is_active` is a pushed-down predicate, and
 * it keeps the retired half from re-rendering when an active Tag is renamed.
 *
 * No org predicate. The shape is scoped to the agency server-side, so filtering
 * by `organization_id` here re-states server-side authorization as a client-side
 * filter — redundant, and a stale column spelling in one empties the list rather
 * than narrowing it.
 */

import { eq, useLiveSuspenseQuery } from '@tanstack/react-db';
import { tags } from '../../lib/collections/tags';

/** A Tag as its management page shows one and its dialog edits one. */
export interface TagRecord {
	readonly id: string;
	readonly name: string;
	readonly description: string | null;
	/** A hex string the agency chose, or `null`. Validated where it is rendered. */
	readonly color: string | null;
	readonly isActive: boolean;
}

export function useTagCatalog(): {
	readonly activeTags: readonly TagRecord[];
	readonly inactiveTags: readonly TagRecord[];
} {
	return { activeTags: useTagHalf(true), inactiveTags: useTagHalf(false) };
}

function useTagHalf(isActive: boolean): readonly TagRecord[] {
	return useLiveSuspenseQuery(
		(query) =>
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
		[isActive],
	).data;
}
