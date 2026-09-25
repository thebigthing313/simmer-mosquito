/**
 * One Sample, with the Inspection that produced it and the place that Inspection
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
 *
 * ## The third join
 *
 * `addresses` came last (#1231). A sample taken away from a Habitat had nothing
 * between its Habitat name and its coordinates, so it titled itself with a pair
 * of numbers while the Address it was linked to sat one join away on the parent
 * inspection. Fifteen sibling seams already join it, from `use-inspection.ts` to
 * `use-trap.ts`, and this was the one larval record seam that did not.
 *
 * `addresses` syncs on demand, so that join is over an on-demand collection,
 * which is #1026's shape. The direction question that issue is about does not
 * arise here: this is a `left` join off a read already narrowed to one Sample by
 * id, so the planner asks `addresses` for at most one row rather than choosing
 * which side to drive a page from.
 */

import { coalesce, eq } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { habitats } from '../../lib/collections/habitats';
import { inspections } from '../../lib/collections/inspections';
import { samples } from '../../lib/collections/samples';
import { joinedHabitatNameSelect } from './habitat-view';
import type { Sample } from './sample-view';
import { addressSelect, useRecordById } from './shared';

export function useSample(sampleId: string): {
	readonly sample: Sample | undefined;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useRecordById({
		collection: samples(),
		id: sampleId,
		query: (query) =>
			query
				.join(
					{ inspection: inspections() },
					({ record: sample, inspection }) => eq(sample.inspection_id, inspection.id),
					'left',
				)
				.join(
					{ habitat: habitats() },
					({ inspection, habitat }) => eq(inspection.habitat_id, habitat.id),
					'left',
				)
				.join(
					{ address: addresses() },
					({ inspection, address }) => eq(inspection.address_id, address.id),
					'left',
				)
				.select(({ record: sample, inspection, habitat, address }) => ({
					id: sample.id,
					address: addressSelect(address),
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
					// `sample.inspection_id` is not nullable, so the Sample's own column
					// cannot say whether the Inspection has arrived. Here "unmatched" only
					// ever means "still streaming".
					inspectionDate: coalesce(inspection.inspection_date, null),

					habitatId: coalesce(inspection.habitat_id, null),
					// Guarded on the joined Habitat row and not on `inspection.habitat_id`.
					// That column is `undefined` while the Inspection is arriving and `null`
					// for an Ad Hoc Inspection, and a guard reading it let the coordinate
					// fallback build `, ` out of an absent row in the first case (#998).
					habitatName: joinedHabitatNameSelect(habitat),

					latitude: coalesce(inspection.lat, null),
					longitude: coalesce(inspection.lng, null),
					geometryKind: coalesce(inspection.geom_type, null),
				})),
	});

	return { sample: result.record, isReady: result.isReady, isError: result.isError };
}
