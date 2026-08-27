/**
 * What was found in a Sample, biggest count first.
 *
 * The identifications a technician recorded against one jar, each already carrying
 * the species name rather than an id for the caller to look up. The taxonomy is a
 * small eager catalog, so joining it costs no request — it reads rows the app
 * already holds — and the join is what keeps the name arriving with the count
 * instead of one render later.
 *
 * Empty is the ordinary state, not an error: a Sample with no identifications is
 * one awaiting identification, which is a lifecycle the Sample surfaces show
 * rather than a gap they apologise for.
 */

import { coalesce, eq, useLiveQuery } from '@tanstack/react-db';
import { sample_species } from '../../lib/collections/sample_species';
import { species } from '../../lib/collections/species';
import type { SampleIdentification } from './sample-view';
import { mapCardGcTimeMs } from './shared';

export function useSampleIdentifications(sampleId: string): {
	readonly identifications: readonly SampleIdentification[];
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ identification: sample_species })
					.where(({ identification }) => eq(identification.sample_id, sampleId))
					// `inner`: an identification names a species that exists. A row whose
					// species had vanished from the taxonomy would be a count of nothing.
					.join({ taxon: species }, ({ identification, taxon }) =>
						eq(identification.species_id, taxon.id),
					)
					.orderBy(({ identification }) => identification.larvae_count, 'desc')
					.select(({ identification, taxon }) => ({
						speciesId: identification.species_id,
						// `coalesce` even though the join is `inner`: the query builder types
						// every joined column as possibly absent, and a taxonomy row that is
						// still arriving is genuinely absent for a frame. The fallback is the
						// same string the call site used to supply.
						speciesName: coalesce(taxon.display_name, 'Unknown species'),
						larvaeCount: identification.larvae_count,
						identifiedAt: identification.identified_at,
					})),
		},
		[sampleId],
	);

	return { identifications: result.data, isReady: result.isReady };
}
