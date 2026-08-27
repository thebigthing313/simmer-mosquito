/**
 * The taxonomy, as a lookup from species id to the name to show.
 *
 * Species are referenced by id everywhere a count is recorded — a sample's
 * identifications, a collection's, a key binding — and every one of those surfaces
 * needs the same thing back: what to call it. `display_name` is the name the
 * taxonomy already resolves for that purpose, so nothing here composes genus and
 * epithet.
 *
 * A `Map` rather than rows, which is the one case `shared.ts` allows a `useMemo`
 * for: a query returns rows and cannot return a lookup of them. The `select`
 * narrows to the two columns first, so a taxonomy row whose genus moved does not
 * rebuild the index.
 *
 * Suspense, because the catalog is eager and small — it is loaded before a surface
 * that reads it can be reached.
 */

import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { species } from '../../lib/collections/species';

export function useSpeciesNames(): ReadonlyMap<string, string> {
	const result = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ taxon: species })
				.select(({ taxon }) => ({ id: taxon.id, name: taxon.display_name })),
		[],
	);

	return useMemo(
		() => new Map(result.data.map((taxon) => [taxon.id, taxon.name] as const)),
		[result.data],
	);
}
