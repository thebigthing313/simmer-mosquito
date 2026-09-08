/**
 * One Habitat Inspection, with everything a card shows it beside.
 *
 * The map focus card, which appears next to a map that is already drawn — so it
 * renders its own skeleton rather than suspending and blanking what surrounds it.
 *
 * ## What this replaces
 *
 * Five sequential queries. The card read the inspection, then its Habitat, then
 * the Habitat Type, then the inspector, then the Address — each one waiting for
 * the render before it, because each needed an id the previous query returned.
 * Opening a card cost five round trips through React and four subset requests
 * that could not start until the one before it finished.
 *
 * It is one query now. The joins are compiled into the pipeline, so the planner
 * collects the join keys and asks each collection for exactly the rows it needs,
 * and the card fills in as they arrive rather than in five steps.
 *
 * The Address is the one thing still resolved separately, by `useAddress` in the
 * card itself. It is not a join because `MapCardAddress` — the shared row that
 * every card uses to show an address — resolves it too, and the two would be
 * fetching the same row by two different routes. One hook, used twice against the
 * same collection, is one subset.
 */

import { caseWhen, coalesce, concat, eq, isNull, useLiveQuery } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { habitat_types } from '../../lib/collections/habitat_types';
import { habitats } from '../../lib/collections/habitats';
import { inspections } from '../../lib/collections/inspections';
import { profiles } from '../../lib/collections/profiles';
import type { InspectionCard } from './larval-activity-view';
import { mapCardGcTimeMs } from './shared';

export function useInspection(inspectionId: string): {
	readonly inspection: InspectionCard | undefined;
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ inspection: inspections() })
					.where(({ inspection }) => eq(inspection.id, inspectionId))
					// `left` throughout: an Ad Hoc Inspection has no Habitat, an inspection
					// need not name a type, and nobody may have been recorded as inspector.
					// An `inner` join would return no row at all for any of those.
					.join(
						{ habitat: habitats() },
						({ inspection, habitat }) => eq(inspection.habitat_id, habitat.id),
						'left',
					)
					.join(
						{ type: habitat_types() },
						({ inspection, type }) => eq(inspection.habitat_type_id, type.id),
						'left',
					)
					.join(
						{ inspector: profiles() },
						({ inspection, inspector }) => eq(inspection.inspected_by_profile_id, inspector.id),
						'left',
					)
					.join(
						{ address: addresses() },
						({ inspection, address }) => eq(inspection.address_id, address.id),
						'left',
					)
					.select(({ inspection, habitat, type, inspector, address }) => ({
						address: {
							id: address.id,
							displayName: address.display_name,
							addressLine1: address.address_line_1,
							addressLine2: address.address_line_2,
							locality: address.locality,
							region: address.region,
							postalCode: address.postal_code,
						},
						id: inspection.id,
						inspectionDate: inspection.inspection_date,
						inspectedByProfileId: inspection.inspected_by_profile_id,
						// Guarded on the inspection's own column rather than read off the joined
						// row: an unmatched `left` join yields `undefined` for every `x.*`, and
						// the guard is what turns that into the `null` this row speaks in.
						inspectedByName: caseWhen(
							isNull(inspection.inspected_by_profile_id),
							null,
							inspector.display_name,
						),
						isWet: inspection.is_wet,
						density: inspection.density,
						larvaeCount: inspection.larvae_count,

						habitatId: inspection.habitat_id,
						habitatName: caseWhen(
							isNull(inspection.habitat_id),
							null,
							coalesce(habitat.habitat_name, concat(habitat.lat, ', ', habitat.lng)),
						),
						habitatTypeId: inspection.habitat_type_id,
						typeName: caseWhen(isNull(inspection.habitat_type_id), null, type.name),

						latitude: inspection.lat,
						longitude: inspection.lng,
						geometryKind: inspection.geom_type,
						addressId: inspection.address_id,

						hasEggs: inspection.has_eggs,
						hasFirstInstar: inspection.has_first_instar,
						hasSecondInstar: inspection.has_second_instar,
						hasThirdInstar: inspection.has_third_instar,
						hasFourthInstar: inspection.has_fourth_instar,
						hasPupae: inspection.has_pupae,
					})),
		},
		[inspectionId],
	);

	return { inspection: result.data[0], isReady: result.isReady };
}
