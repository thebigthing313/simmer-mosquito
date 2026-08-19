/**
 * The mosquito taxonomy, as rows.
 *
 * `useSpeciesNames` answers "what is this id called" and `useSpeciesOptions`
 * answers "what may this agency record"; this is for the surfaces that need the
 * rows themselves — a species breakdown that has to tell a real taxon from the
 * catalog's placeholder, and a page building more than one control from one read.
 *
 * The taxonomy is a global catalog rather than an agency one — no
 * `organization_id` — and it is eager, so this costs no request and suspends.
 */

import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { species } from '../../lib/collections/species';

/** A taxon as the surfaces that list one read it. */
export interface SpeciesListing {
	readonly id: string;
	readonly displayName: string;
	/**
	 * The species half of the binomial.
	 *
	 * Carried because it is how the placeholder taxon is recognised: specimens
	 * never keyed out are recorded against an "Unidentified mosquito" row whose
	 * epithet is `unidentified`, and a species breakdown has to leave it out or it
	 * reads as the most abundant species in the county.
	 */
	readonly epithet: string;
}

export function useSpeciesCatalog(): readonly SpeciesListing[] {
	const result = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ taxon: species })
				.orderBy(({ taxon }) => taxon.display_name, 'asc')
				.select(({ taxon }) => ({
					id: taxon.id,
					displayName: taxon.display_name,
					epithet: taxon.epithet,
				})),
		[],
	);

	return result.data;
}
