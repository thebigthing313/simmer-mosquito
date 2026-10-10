/**
 * The specimens collected during one Inspection, with what was identified in each.
 *
 * A nested include rather than two queries: a species count belongs to a sample
 * the way a sample belongs to an inspection, and the correlated `eq()` in the
 * subquery is what drives Electric's on-demand subset for it. Two queries would
 * be a render round-trip and a second request.
 *
 * Ordered by `created_at` so the grid reads in the order the crew keyed the
 * samples in, which is the order the labels were written on the vials.
 *
 * Each species count carries its taxon's name through a `left` join on the
 * species catalog inside the include, so the page reads a name rather than
 * looking one up by id (#874). The join feeds the label only; the subset
 * Electric is asked for is still the `sample_id` the include correlates on.
 *
 * Both collections are on-demand, so this uses the status-gated `useLiveQuery`
 * rather than the suspense variant, which sticks after a navigation unmount over
 * an on-demand collection.
 */

import { coalesce, eq, toArray, useLiveQuery } from '@tanstack/react-db';
import { sample_species } from '../../lib/collections/sample_species';
import { samples } from '../../lib/collections/samples';
import { species as speciesCatalog } from '../../lib/collections/species';
import { activityGcTimeMs } from './shared';

/** One identification under a sample. */
export interface InspectionSampleSpecies {
	readonly id: string;
	readonly speciesId: string;
	/** The taxon's name, or `null` when the catalog entry is not in the client. */
	readonly speciesName: string | null;
	readonly larvaeCount: number;
}

/** One specimen taken during the inspection. */
export interface InspectionSample {
	readonly id: string;
	/** `null` on an unlabeled sample — the page names it by a short id instead. */
	readonly displayName: string | null;
	readonly isZeroLarvae: boolean;
	readonly hasNonMosquito: boolean;
	readonly unidentifiableReason: string | null;
	readonly species: readonly InspectionSampleSpecies[];
}

export function useInspectionSamples(inspectionId: string): {
	readonly samples: readonly InspectionSample[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ sample: samples() })
				.where(({ sample }) => eq(sample.inspection_id, inspectionId))
				.orderBy(({ sample }) => sample.created_at, 'asc')
				.select(({ sample }) => ({
					id: sample.id,
					displayName: sample.display_name,
					isZeroLarvae: sample.is_zero_larvae,
					hasNonMosquito: sample.has_non_mosquito,
					unidentifiableReason: sample.unidentifiable_reason,
					species: toArray(
						query
							.from({ species: sample_species() })
							.where(({ species }) => eq(species.sample_id, sample.id))
							.join(
								{ taxon: speciesCatalog() },
								({ species, taxon }) => eq(species.species_id, taxon.id),
								'left',
							)
							.select(({ species, taxon }) => ({
								id: species.id,
								speciesId: species.species_id,
								speciesName: coalesce(taxon.display_name, null),
								larvaeCount: species.larvae_count,
							})),
					),
				})),
	});

	return {
		samples: (result.data ?? []) as unknown as readonly InspectionSample[],
		isReady: result.isReady,
		isError: result.isError,
	};
}
