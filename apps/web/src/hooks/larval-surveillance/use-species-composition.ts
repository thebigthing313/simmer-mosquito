import { gte, useLiveQuery } from '@tanstack/react-db';
import type { SpeciesTotal } from '../../components/species-composition-panel';
import { sample_species } from '../../lib/collections/sample_species';
import { activityGcTimeMs } from '../queries/shared';
import { useSpeciesNames } from '../queries/use-species-names';

interface LoadState {
	readonly isReady: boolean;
	readonly isError: boolean;
}

/**
 * The ranked totals themselves, beside the hook rather than inside it.
 *
 * A row with no larvae counted contributes nothing, so an inspection that found
 * a species and recorded no number does not read as a zero-count species.
 */
function speciesTotals(
	rows: readonly { readonly speciesId: string; readonly larvaeCount: number | null }[],
	nameById: ReadonlyMap<string, string>,
): { readonly totals: readonly SpeciesTotal[]; readonly grandTotal: number } {
	const byId = new Map<string, number>();
	let sum = 0;
	for (const row of rows) {
		const count = row.larvaeCount ?? 0;
		if (count <= 0) {
			continue;
		}
		byId.set(row.speciesId, (byId.get(row.speciesId) ?? 0) + count);
		sum += count;
	}
	const ranked: SpeciesTotal[] = [...byId.entries()]
		.map(([speciesId, total]) => ({
			speciesId,
			total,
			name: nameById.get(speciesId) ?? 'Unknown species',
		}))
		.sort((first, second) => second.total - first.total);
	return { totals: ranked, grandTotal: sum };
}

/**
 * Larvae totals by species identified since `sinceDate`, sorted high to low,
 * off the on-demand `sample_species` shape. Species names resolve from the
 * eager `species` catalog.
 */
export function useSpeciesComposition(sinceDate: string): {
	readonly totals: readonly SpeciesTotal[];
	readonly grandTotal: number;
} & LoadState {
	const nameById = useSpeciesNames();

	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ identification: sample_species() })
				.where(({ identification }) => gte(identification.identified_at, sinceDate))
				.select(({ identification }) => ({
					speciesId: identification.species_id,
					larvaeCount: identification.larvae_count,
				})),
	});

	const rows = result.data;

	const { totals, grandTotal } = speciesTotals(rows, nameById);

	return { totals, grandTotal, isReady: result.isReady, isError: result.isError };
}
