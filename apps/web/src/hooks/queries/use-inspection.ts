/**
 * One Habitat Inspection, with everything a card or its detail page shows it
 * beside.
 *
 * The map focus card, which appears next to a map that is already drawn — so it
 * renders its own skeleton rather than suspending and blanking what surrounds it.
 * The detail page reads the same row (#874): it used to fetch the whole record
 * from `/map/inspections/:id`, and now only the geometry comes from there,
 * through `useOwnedGeometry`.
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

import { eq } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { habitat_types } from '../../lib/collections/habitat_types';
import { habitats } from '../../lib/collections/habitats';
import { inspections } from '../../lib/collections/inspections';
import { profiles } from '../../lib/collections/profiles';
import { joinedHabitatNameSelect } from './habitat-view';
import type { InspectionCard } from './larval-activity-view';
import { addressSelect, joinedOrNull, useRecordById } from './shared';

export function useInspection(inspectionId: string): {
	readonly inspection: InspectionCard | undefined;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useRecordById({
		collection: inspections(),
		id: inspectionId,
		query: (query) =>
			query
				// `left` throughout: an Ad Hoc Inspection has no Habitat, an inspection
				// need not name a type, and nobody may have been recorded as inspector.
				// An `inner` join would return no row at all for any of those.
				.join(
					{ habitat: habitats() },
					({ record: inspection, habitat }) => eq(inspection.habitat_id, habitat.id),
					'left',
				)
				.join(
					{ type: habitat_types() },
					({ record: inspection, type }) => eq(inspection.habitat_type_id, type.id),
					'left',
				)
				.join(
					{ inspector: profiles() },
					({ record: inspection, inspector }) =>
						eq(inspection.inspected_by_profile_id, inspector.id),
					'left',
				)
				.join(
					{ address: addresses() },
					({ record: inspection, address }) => eq(inspection.address_id, address.id),
					'left',
				)
				.select(({ record: inspection, habitat, type, inspector, address }) => ({
					address: addressSelect(address),
					id: inspection.id,
					inspectionDate: inspection.inspection_date,
					inspectedByProfileId: inspection.inspected_by_profile_id,
					inspectedByName: joinedOrNull(inspector.display_name),
					isWet: inspection.is_wet,
					dipCount: inspection.dip_count,
					density: inspection.density,
					larvaeCount: inspection.larvae_count,

					habitatId: inspection.habitat_id,
					// Guarded on the joined row and not on `habitat_id`: the row can be
					// arriving, and `habitat-view.ts` says what that reads as (#998).
					habitatName: joinedHabitatNameSelect(habitat),
					habitatTypeId: inspection.habitat_type_id,
					typeName: joinedOrNull(type.name),

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

					createdAt: inspection.created_at,
					updatedAt: inspection.updated_at,
				})),
	});

	return { inspection: result.record, isReady: result.isReady, isError: result.isError };
}
