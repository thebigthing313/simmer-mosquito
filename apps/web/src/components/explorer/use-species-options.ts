import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { useSpeciesNames } from '../../hooks/queries/use-species-names';
import { organization_species } from '../../lib/collections/organization_species';
import { species } from '../../lib/collections/species';
import type { FilterOption } from './multi-select-filter';

/**
 * The species an agency records, as filter options, plus the taxonomy as a lookup.
 *
 * Two different sets, deliberately. The **options** are the species the agency has
 * adopted — a New Jersey program records perhaps thirty of the taxonomy's
 * thousands, and offering the rest would bury the ones it actually finds. The
 * **names** are the whole taxonomy, because a sample identified years ago may name
 * a species the agency has since dropped from its list, and that record still has
 * to read as what it is.
 *
 * When the agency has curated nothing, the options fall back to the full catalog:
 * an empty filter is worse than a long one, and a new agency has not got to its
 * species list yet.
 *
 * The two queries run alongside each other rather than in sequence — neither
 * needs anything the other returns.
 */
export function useSpeciesOptions(): {
	readonly options: readonly FilterOption[];
	readonly nameById: ReadonlyMap<string, string>;
} {
	const nameById = useSpeciesNames();

	const catalog = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ taxon: species() })
				.orderBy(({ taxon }) => taxon.display_name, 'asc')
				.select(({ taxon }) => ({ id: taxon.id, label: taxon.display_name })),
		[],
	);

	const adopted = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ adoption: organization_species() })
				.select(({ adoption }) => ({ speciesId: adoption.species_id })),
		[],
	);

	const catalogOptions = catalog.data;
	const adoptions = adopted.data;

	return useMemo(() => {
		const adoptedIds = new Set(adoptions.map((row) => row.speciesId));
		return {
			nameById,
			options:
				adoptedIds.size === 0
					? catalogOptions
					: catalogOptions.filter((option) => adoptedIds.has(option.id)),
		};
	}, [catalogOptions, adoptions, nameById]);
}
