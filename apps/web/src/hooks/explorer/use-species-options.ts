import { useLiveSuspenseQuery } from '@tanstack/react-db';
import type { FilterOption } from '../../components/explorer/multi-select-filter';
import { organization_species } from '../../lib/collections/organization_species';
import { species } from '../../lib/collections/species';
import { useSpeciesNames } from '../queries/use-species-names';

/**
 * The species an organization records, as filter options, plus the whole
 * taxonomy as an id to name lookup.
 *
 * The options are the organization's adopted species, or the full catalog when
 * it has adopted none. The lookup covers every species, so a record naming one
 * the organization has since dropped still reads as what it is.
 */
export function useSpeciesOptions(): {
	readonly options: readonly FilterOption[];
	readonly nameById: ReadonlyMap<string, string>;
} {
	const nameById = useSpeciesNames();

	const catalog = useLiveSuspenseQuery((query) =>
		query
			.from({ taxon: species() })
			.orderBy(({ taxon }) => taxon.display_name, 'asc')
			.select(({ taxon }) => ({ id: taxon.id, label: taxon.display_name })),
	);

	const adopted = useLiveSuspenseQuery((query) =>
		query
			.from({ adoption: organization_species() })
			.select(({ adoption }) => ({ speciesId: adoption.species_id })),
	);

	const catalogOptions = catalog.data;
	const adoptions = adopted.data;

	const adoptedIds = new Set(adoptions.map((row) => row.speciesId));

	return {
		nameById,
		options:
			adoptedIds.size === 0
				? catalogOptions
				: catalogOptions.filter((option) => adoptedIds.has(option.id)),
	};
}
