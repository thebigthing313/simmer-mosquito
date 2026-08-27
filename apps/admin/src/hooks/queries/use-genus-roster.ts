/**
 * Every genus, and how many species hang off each.
 *
 * ## This folder is the console's read seam
 *
 * A route asks for a shape by name, and what it gets back is named for the
 * domain. Below this line everything is snake_case, because that is what Electric
 * streams; above it nothing knows a column exists. One hook per file, named for
 * the hook. `apps/web/src/hooks/queries/shared.ts` carries the full argument and
 * the rules about where a transform belongs — they hold here unchanged. The one
 * difference is that these hooks return `isReady` rather than suspending: the
 * console has no Suspense boundaries, and `CatalogBody` already takes an
 * `isReady` and renders the loading state itself.
 *
 * The seam is not decoration. The collections used to hold camelCase rows,
 * because `packages/sync` mapped column names on the way in; that mapper is gone,
 * and the three ways it surfaced are why the reads belong in one place. The
 * species page threw on `displayName.localeCompare`. The units page counted "25
 * units" and then listed none, every filter comparing against `undefined`. The
 * genera page worked, because `id`, `name` and `abbreviation` are single words
 * that spell the same either way. Only the first looks like a fault.
 *
 * ## Two queries, not one join
 *
 * The count is the one fact that changes what an operator may do with a row — a
 * genus in use cannot be deleted — so it has to arrive with the list rather than
 * be discovered by trying. It was tempting to get both from a single left join
 * grouped by genus, and that does produce the right numbers; it also loses the
 * sort. `orderBy` is not honoured on a grouped query here, and it cannot read the
 * projection either, so there is nowhere left to put it. (Two other things about
 * that shape are worth knowing: the builder holds to strict SQL, so every
 * non-aggregate column in the `select` must appear in the `groupBy` — Postgres's
 * functional-dependency relaxation does not apply — and none of it is visible to
 * `tsc`. It fails at render.)
 *
 * So: an ordered list, and a grouped count beside it, which is the shape
 * `use-assignment-item-counts.ts` already uses in `apps/web`. The `Map` is the
 * documented exception to keeping transforms in the query — a query returns rows
 * and cannot return a lookup of them — and the route reads the two as the
 * separate props it already took.
 */

import { count, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { genera } from '../../lib/collections/genera';
import { species } from '../../lib/collections/species';

/** A genus as the pages that list one read it. */
export interface GenusListing {
	readonly id: string;
	readonly name: string;
	readonly abbreviation: string;
}

export function useGenusRoster(): {
	readonly genera: readonly GenusListing[];
	/** Absent means none, which is what makes a genus deletable. */
	readonly speciesCountById: ReadonlyMap<string, number>;
	readonly isReady: boolean;
} {
	const roster = useLiveQuery(
		(query) =>
			query
				.from({ genus: genera })
				.orderBy(({ genus }) => genus.name, 'asc')
				.select(({ genus }) => ({
					id: genus.id,
					name: genus.name,
					abbreviation: genus.abbreviation,
				})),
		[],
	);

	const counts = useLiveQuery(
		(query) =>
			query
				.from({ taxon: species })
				.groupBy(({ taxon }) => taxon.genus_id)
				.select(({ taxon }) => ({
					genusId: taxon.genus_id,
					total: count(taxon.id),
				})),
		[],
	);

	const speciesCountById = useMemo(
		() =>
			new Map(
				counts.data
					// A species may name no genus — the special categories do — and that
					// group is a real row here with a null key. It belongs to no genus, so
					// it belongs in no genus's count.
					.filter((row) => row.genusId !== null)
					.map((row) => [row.genusId as string, Number(row.total)] as const),
			),
		[counts.data],
	);

	return {
		genera: roster.data as readonly GenusListing[],
		speciesCountById,
		// Both, because a list showing every genus as "0 species" while the counts
		// are still arriving would say something false rather than nothing.
		isReady: roster.isReady && counts.isReady,
	};
}
