/**
 * One Inspection, as its own edit form reads it.
 *
 * The counterpart of `use-habitat-record.ts`, and here for the same reason:
 * `use-inspection.ts` joins the habitat, the address and the inspector so a
 * detail page can name them, and every one of those joins is a subset request a
 * form does not need. What a form needs is the columns it writes back.
 *
 * `habitat_id` decides which kind of inspection this is — an ad hoc one owns its
 * geometry and its habitat type, a habitat one inherits both — so it is here
 * even though the form has no field for it.
 *
 * `updatedAt` rides along because the form keys its geometry fetch on it, so a
 * re-opened form loads the shape as it stands rather than a cached earlier one.
 *
 * `inspections` is on-demand, so this uses the status-gated `useLiveQuery`
 * rather than the suspense variant, which sticks after a navigation unmount over
 * an on-demand collection.
 */

import type { LarvalDensity } from '@simmer-mosquito/domain';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { inspections } from '../../lib/collections/inspections';
import { mapCardGcTimeMs, unmatchableId } from './shared';

/** An Inspection as its edit form holds one. */
export interface InspectionRecord {
	readonly id: string;
	/** `null` on an ad hoc inspection, which is what makes it one. */
	readonly habitatId: string | null;
	/** Only an ad hoc inspection carries its own type; a habitat one takes the habitat's. */
	readonly habitatTypeId: string | null;
	readonly addressId: string | null;
	readonly inspectedByProfileId: string | null;
	/** `YYYY-MM-DD` — the operational date, not a timestamp. */
	readonly inspectionDate: string;
	readonly isWet: boolean;
	readonly dipCount: number | null;
	readonly density: LarvalDensity | null;
	readonly larvaeCount: number | null;
	readonly hasEggs: boolean;
	readonly hasFirstInstar: boolean;
	readonly hasSecondInstar: boolean;
	readonly hasThirdInstar: boolean;
	readonly hasFourthInstar: boolean;
	readonly hasPupae: boolean;
	/** What the geometry fetch is keyed on, so an edited shape is not read back stale. */
	readonly updatedAt: Date;
}

export function useInspectionRecord(inspectionId: string | null | undefined): {
	readonly inspection: InspectionRecord | undefined;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const id = inspectionId ?? unmatchableId;

	const result = useLiveQuery(
		{
			gcTime: mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ inspection: inspections() })
					.where(({ inspection }) => eq(inspection.id, id))
					.select(({ inspection }) => ({
						id: inspection.id,
						habitatId: inspection.habitat_id,
						habitatTypeId: inspection.habitat_type_id,
						addressId: inspection.address_id,
						inspectedByProfileId: inspection.inspected_by_profile_id,
						inspectionDate: inspection.inspection_date,
						isWet: inspection.is_wet,
						dipCount: inspection.dip_count,
						density: inspection.density,
						larvaeCount: inspection.larvae_count,
						hasEggs: inspection.has_eggs,
						hasFirstInstar: inspection.has_first_instar,
						hasSecondInstar: inspection.has_second_instar,
						hasThirdInstar: inspection.has_third_instar,
						hasFourthInstar: inspection.has_fourth_instar,
						hasPupae: inspection.has_pupae,
						updatedAt: inspection.updated_at,
					})),
		},
		[id],
	);

	return { inspection: result.data[0], isReady: result.isReady, isError: result.isError };
}
