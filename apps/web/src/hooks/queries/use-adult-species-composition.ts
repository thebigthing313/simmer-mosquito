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
 */

import { gte, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { collection_species } from '../../lib/collections/collection_species';
import { activityGcTimeMs } from './shared';
import { useSpeciesNames } from './use-species-names';

export interface SpeciesTotal {
	readonly speciesId: string;
	readonly name: string;
	readonly total: number;
}

export function useAdultSpeciesComposition(sinceDate: string): {
	readonly totals: readonly SpeciesTotal[];
	readonly grandTotal: number;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const nameById = useSpeciesNames();

	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ identification: collection_species })
					.where(({ identification }) => gte(identification.identified_date, sinceDate))
					.select(({ identification }) => ({
						speciesId: identification.species_id,
						count: identification.count,
					})),
		},
		[sinceDate],
	);

	const rows = result.data;

	const { totals, grandTotal } = useMemo(() => {
		const byId = new Map<string, number>();
		let sum = 0;
		for (const row of rows) {
			const count = row.count ?? 0;
			// Non-positive counts are ignored, so a zero row neither inflates the
			// total nor claims the species was present.
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
	}, [rows, nameById]);

	return { totals, grandTotal, isReady: result.isReady, isError: result.isError };
}
