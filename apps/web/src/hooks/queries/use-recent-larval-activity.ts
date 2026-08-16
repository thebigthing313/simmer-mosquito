/**
 * Recent Habitat Inspections, with the site each was made at.
 *
 * The larval overview's heavy list, which reaches back over a window rather than
 * naming a day. Same row as `use-larval-activity-for-date.ts` and the same joins;
 * only the predicate and the ordering differ.
 *
 * The two are not one hook with an optional bound. A day panel and a rolling
 * window are different subsets — the day is an equality Electric can serve alone,
 * and merging them would make every day panel carry a range predicate it does not
 * want.
 */

import { caseWhen, coalesce, concat, eq, gte, isNull, useLiveQuery } from '@tanstack/react-db';
import { habitat_types } from '../../lib/collections/habitat_types';
import { habitats } from '../../lib/collections/habitats';
import { inspections } from '../../lib/collections/inspections';
import { profiles } from '../../lib/collections/profiles';
import type { LarvalActivityRow } from './larval-activity-view';
import { activityGcTimeMs } from './shared';

export function useRecentLarvalActivity(sinceDate: string): {
	readonly rows: readonly LarvalActivityRow[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ inspection: inspections })
					.where(({ inspection }) => gte(inspection.inspection_date, sinceDate))
					// `left`, not `inner`: an Ad Hoc Inspection has no Habitat, and an
					// `inner` join would drop every one of them from the list.
					.join(
						{ habitat: habitats },
						({ inspection, habitat }) => eq(inspection.habitat_id, habitat.id),
						'left',
					)
					// `profiles` is eager, so this join costs no request — it reads rows the
					// app already holds. It is a join rather than a lookup map built beside
					// the query for the same reason the Habitat is: the row should arrive
					// whole.
					.join(
						{ inspector: profiles },
						({ inspection, inspector }) => eq(inspection.inspected_by_profile_id, inspector.id),
						'left',
					)
					.join(
						{ type: habitat_types },
						({ inspection, type }) => eq(inspection.habitat_type_id, type.id),
						'left',
					)
					.orderBy(({ inspection }) => inspection.inspection_date, 'desc')
					.select(({ inspection, habitat, type, inspector }) => ({
						id: inspection.id,
						inspectionDate: inspection.inspection_date,
						inspectedByProfileId: inspection.inspected_by_profile_id,
						inspectedByName: caseWhen(
							isNull(inspection.inspected_by_profile_id),
							null,
							inspector.display_name,
						),
						isWet: inspection.is_wet,
						density: inspection.density,
						larvaeCount: inspection.larvae_count,

						habitatId: inspection.habitat_id,
						// Guarded on the inspection's own column rather than read straight off
						// the joined row. An Ad Hoc Inspection matches no Habitat, so every
						// `habitat.*` here is absent — and the coordinate fallback would happily
						// build a label out of nothing. This is what makes "no Habitat" read as
						// no name instead of as a name nobody can place.
						habitatName: caseWhen(
							isNull(inspection.habitat_id),
							null,
							coalesce(habitat.habitat_name, concat(habitat.lat, ', ', habitat.lng)),
						),
						habitatTypeId: inspection.habitat_type_id,
						// Guarded for the same reason, and it also turns the join miss from
						// `undefined` into the `null` the rest of this row speaks in.
						typeName: caseWhen(isNull(inspection.habitat_type_id), null, type.name),

						latitude: inspection.lat,
						longitude: inspection.lng,

						hasEggs: inspection.has_eggs,
						hasFirstInstar: inspection.has_first_instar,
						hasSecondInstar: inspection.has_second_instar,
						hasThirdInstar: inspection.has_third_instar,
						hasFourthInstar: inspection.has_fourth_instar,
						hasPupae: inspection.has_pupae,
					})),
		},
		[sinceDate],
	);

	return { rows: result.data, isReady: result.isReady, isError: result.isError };
}
