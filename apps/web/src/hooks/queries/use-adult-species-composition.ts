/**
 * Specimen totals by species over a window, high to low.
 *
 * The adult counterpart to `useSpeciesComposition` under larval surveillance,
 * which rolls up larvae rather than adults and windows on a different column.
 * They are two hooks rather than one parameterised over a table because the only
 * thing they share is the shape of the answer.
 *
 * Windowed on `identified_date`, which is when the specimens were keyed out
 * rather than when the trap was emptied. A composition chart is a claim about
 * what has been identified, so a collection sitting unidentified for three weeks
 * should not appear in a seven-day window the day someone finally reads it —
 * which is what dating this by the collection would do.
 *
 * Males are left out unless `includeMales` is set. Surveillance reads the
 * females, since they are what bite, so a male-heavy trap night would otherwise
 * outrank the species the panel is asked about. A row with no sex recorded
 * counts as female, which is the column's default. A taxon named "unknown" is
 * left out of the bars and the total alike: it records that nobody keyed the
 * specimens out, and the panel is a claim about what was identified.
 */

import type { SpeciesSex } from '@simmer-mosquito/domain';
import { gte, useLiveQuery } from '@tanstack/react-db';
import type { SpeciesTotal } from '../../components/species-composition-panel';
import { collection_species } from '../../lib/collections/collection_species';
import { liveQueryGcTimeMs } from './shared';
import { useSpeciesNames } from './use-species-names';

export function useAdultSpeciesComposition(
	sinceDate: string,
	includeMales: boolean,
): {
	readonly totals: readonly SpeciesTotal[];
	readonly grandTotal: number;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const nameById = useSpeciesNames();

	const result = useLiveQuery({
		gcTime: liveQueryGcTimeMs,
		query: (query) =>
			query
				.from({ identification: collection_species() })
				.where(({ identification }) => gte(identification.identified_date, sinceDate))
				.select(({ identification }) => ({
					speciesId: identification.species_id,
					count: identification.count,
					sex: identification.sex,
				})),
	});

	const rows = result.data;

	const { totals, grandTotal } = rankedComposition(rows, nameById, includeMales);

	return { totals, grandTotal, isReady: result.isReady, isError: result.isError };
}

/** The window's specimens rolled up by species, high to low, with the total. */
export function rankedComposition(
	rows: readonly {
		readonly speciesId: string;
		readonly count: number | null;
		readonly sex: SpeciesSex | null;
	}[],
	nameById: ReadonlyMap<string, string>,
	includeMales: boolean,
): { readonly totals: readonly SpeciesTotal[]; readonly grandTotal: number } {
	const byId = new Map<string, number>();
	let sum = 0;
	for (const row of rows) {
		const count = row.count ?? 0;
		// Non-positive counts are ignored, so a zero row neither inflates the total
		// nor claims the species was present.
		if (
			count <= 0 ||
			(!includeMales && row.sex === 'male') ||
			isUnknownTaxon(nameById.get(row.speciesId))
		) {
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

/** The taxonomy's placeholder for specimens nobody keyed out. */
function isUnknownTaxon(name: string | undefined): boolean {
	return name?.trim().toLowerCase() === 'unknown';
}
