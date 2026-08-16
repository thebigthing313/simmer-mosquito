/**
 * Every genus, with how many species hang off it.
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
 * ## This hook
 *
 * The species count is the one fact that changes what an operator may do with a
 * row — a genus in use cannot be deleted — so it belongs on the row rather than
 * being discovered by trying. It used to be built by reading the whole species
 * table into the component and tallying it in a `useMemo`, which re-ran on every
 * render and, once the rows went snake_case, tallied `undefined` and reported
 * nought against every genus.
 *
 * Here it is a `count()` over a left join, computed in the pipeline: a genus that
 * gains a species emits one changed number rather than a new array of every
 * species in the catalog.
 */

import { count, eq, useLiveQuery } from '@tanstack/react-db';
import { genera } from '../../lib/collections/genera';
import { species } from '../../lib/collections/species';

/** A genus as the page that lists them reads it. */
export interface GenusListing {
	readonly id: string;
	readonly name: string;
	readonly abbreviation: string;
	/** Zero is meaningful: it is what makes a genus deletable. */
	readonly speciesCount: number;
}

export function useGenusRoster(): {
	readonly genera: readonly GenusListing[];
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		(query) =>
			query
				.from({ genus: genera })
				// `left`: a genus with no species is the ordinary case for a freshly
				// added one, and it is precisely the row an operator is most likely to
				// act on. An inner join would hide it.
				.join({ taxon: species }, ({ genus, taxon }) => eq(genus.id, taxon.genus_id), 'left')
				.groupBy(({ genus }) => genus.id)
				.orderBy(({ genus }) => genus.name, 'asc')
				.select(({ genus, taxon }) => ({
					id: genus.id,
					name: genus.name,
					abbreviation: genus.abbreviation,
					// `count` of the joined column, not of the group: on an unmatched left
					// join the column is absent, so this is nought rather than one.
					speciesCount: count(taxon.id),
				})),
		[],
	);

	return { genera: result.data as readonly GenusListing[], isReady: result.isReady };
}
