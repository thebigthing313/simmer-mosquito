/**
 * One Sample, with the Inspection that produced it and the site that Inspection
 * was made at.
 *
 * Three queries before this — sample, then inspection, then habitat — each one
 * unable to start until the previous had rendered the id it needed. They are one
 * join now; see `sample-view.ts` for why a Sample is never read alone.
 *
 * The `inspections` join is `inner` in effect but written `left`: `inspection_id`
 * is not nullable, so every Sample has one, but the row can be *arriving*. An
 * `inner` join would hide the Sample entirely until its Inspection landed, which
 * on a map card is a blank where a title should be.
 */

import { caseWhen, coalesce, concat, eq, isNull, useLiveQuery } from '@tanstack/react-db';
import { habitats } from '../../lib/collections/habitats';
import { inspections } from '../../lib/collections/inspections';
import { samples } from '../../lib/collections/samples';
import type { Sample } from './sample-view';
import { mapCardGcTimeMs } from './shared';

export function useSample(sampleId: string): {
	readonly sample: Sample | undefined;
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ sample: samples() })
					.where(({ sample }) => eq(sample.id, sampleId))
					.join(
						{ inspection: inspections() },
						({ sample, inspection }) => eq(sample.inspection_id, inspection.id),
						'left',
					)
					.join(
						{ habitat: habitats() },
						({ inspection, habitat }) => eq(inspection.habitat_id, habitat.id),
						'left',
					)
					.select(({ sample, inspection, habitat }) => ({
						id: sample.id,
						// Left nullable, unlike a Habitat's name. The fallback for an unnamed
						// Sample is a short id, and the expression language has no substring —
						// `concat('Sample ', sample.id)` would title the card with a full uuid.
						// So this one fallback stays at the call site. See `sample-view.ts`.
						name: sample.display_name,
						isZeroLarvae: sample.is_zero_larvae,
						hasNonMosquito: sample.has_non_mosquito,
						unidentifiableReason: sample.unidentifiable_reason,

						inspectionId: sample.inspection_id,
						// Every field below comes off the joined Inspection, and every one is
						// wrapped in `coalesce` for the same reason: an unmatched join yields
						// `undefined`, not `null`, and the rest of this folder speaks `null`.
						//
						// There is no guard to write instead. A guard has to test the driving
						// row's own column, and `sample.inspection_id` is not nullable, so it
						// cannot say whether the Inspection has arrived. Here "unmatched" only
						// ever means "still streaming".
						inspectionDate: coalesce(inspection.inspection_date, null),

						habitatId: coalesce(inspection.habitat_id, null),
						// Guarded on the Inspection's own column: an Ad Hoc Inspection matches no
						// Habitat, and without the guard the coordinate fallback would build a
						// label out of an absent row.
						habitatName: caseWhen(
							isNull(inspection.habitat_id),
							null,
							coalesce(habitat.habitat_name, concat(habitat.lat, ', ', habitat.lng)),
						),

						latitude: coalesce(inspection.lat, null),
						longitude: coalesce(inspection.lng, null),
						geometryKind: coalesce(inspection.geom_type, null),
					})),
		},
		[sampleId],
	);

	return { sample: result.data[0], isReady: result.isReady };
}
