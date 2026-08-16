/**
 * Every species, already carrying the name of the genus it belongs to.
 *
 * The folder is the console read seam — `use-genus-roster.ts` states the rules.
 *
 * The page used to read both tables and look each genus up in a `Map` it built
 * per render. The join does it in the pipeline and keeps up as rows arrive, which
 * also removes the frame where a species rendered before its genus did.
 */

import { caseWhen, coalesce, eq, isNull, useLiveQuery } from '@tanstack/react-db';
import { genera } from '../../lib/collections/genera';
import { species } from '../../lib/collections/species';

/** A species as the page that lists them reads it. */
export interface SpeciesListing {
	readonly id: string;
	readonly genusId: string | null;
	readonly epithet: string;
	readonly commonName: string | null;
	readonly displayName: string;
	/**
	 * `null` for the special categories that belong to no genus.
	 *
	 * A species may genuinely have no genus — "Unidentified mosquito" and its
	 * siblings are recorded that way — so this is a real state the page renders,
	 * not a gap it apologises for.
	 */
	readonly genusName: string | null;
}

export function useSpeciesRoster(): {
	readonly species: readonly SpeciesListing[];
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		(query) =>
			query
				.from({ taxon: species })
				// `left`: a null-genus species is a designed-for case, not a dangling row.
				.join({ genus: genera }, ({ taxon, genus }) => eq(taxon.genus_id, genus.id), 'left')
				.orderBy(({ taxon }) => taxon.display_name, 'asc')
				.select(({ taxon, genus }) => ({
					id: taxon.id,
					genusId: taxon.genus_id,
					epithet: taxon.epithet,
					commonName: taxon.common_name,
					displayName: taxon.display_name,
					/*
					 * Guarded on the *driving* row's own column, not on the joined one.
					 * An unmatched left join yields `undefined` for every `genus.*`, so
					 * `coalesce(genus.name, …)` alone would hand a fallback name to a
					 * species that names no genus — which is a different thing from one
					 * whose genus row is merely still arriving. Testing `taxon.genus_id`
					 * tells the two apart, and it is also what keeps the field typed
					 * `string | null` rather than plain `string`.
					 */
					genusName: caseWhen(isNull(taxon.genus_id), null, coalesce(genus.name, 'Unknown genus')),
				})),
		[],
	);

	return { species: result.data as readonly SpeciesListing[], isReady: result.isReady };
}
