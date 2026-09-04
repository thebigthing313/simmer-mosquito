/**
 * Recent Habitat Inspections that came back heavy, with the site each was made at.
 *
 * The larval overview's escalation panel. The density filter is in the query
 * rather than applied to the rows afterwards, which is what makes the join
 * affordable: the `habitats` side loads only the sites behind the heavy rows,
 * where filtering after the fact would first pull every site touched in the window.
 *
 * That bound used to be a cap. The panel filtered to heavy rows before resolving
 * names precisely so the id set stayed under the by-ids limit, and the comment
 * saying so warned that resolving the whole window would drop names from the rows
 * that matter. Asking the query for the heavy rows removes the problem rather than
 * working around it.
 */

import {
	and,
	caseWhen,
	coalesce,
	concat,
	eq,
	gte,
	inArray,
	isNull,
	useLiveQuery,
} from '@tanstack/react-db';
import { habitat_types } from '../../lib/collections/habitat_types';
import { habitats } from '../../lib/collections/habitats';
import { inspections } from '../../lib/collections/inspections';
import { profiles } from '../../lib/collections/profiles';
import type { LarvalActivityRow } from './larval-activity-view';
import { activityGcTimeMs } from './shared';

/** What this panel means by heavy. The two top bands of the density scale. */
const heavyDensities = ['heavy', 'very_heavy'];

export function useHeavyLarvalActivity(sinceDate: string): {
	readonly rows: readonly LarvalActivityRow[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ inspection: inspections() })
					.where(({ inspection }) =>
						and(
							gte(inspection.inspection_date, sinceDate),
							inArray(inspection.density, heavyDensities),
						),
					)
					// `left`, not `inner`: an Ad Hoc Inspection has no Habitat, and an
					// `inner` join would drop every one of them — which on this panel would
					// hide standing water found away from a known site.
					.join(
						{ habitat: habitats() },
						({ inspection, habitat }) => eq(inspection.habitat_id, habitat.id),
						'left',
					)
					// `profiles` is eager, so this join costs no request — it reads rows the
					// app already holds. It is a join rather than a lookup map built beside
					// the query for the same reason the Habitat is: the row should arrive
					// whole.
					.join(
						{ inspector: profiles() },
						({ inspection, inspector }) => eq(inspection.inspected_by_profile_id, inspector.id),
						'left',
					)
					.join(
						{ type: habitat_types() },
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
						// Guarded on the inspection's own column rather than read off the joined
						// row: an Ad Hoc Inspection matches no Habitat, so every `habitat.*` here
						// is absent and the coordinate fallback would build a label out of nothing.
						habitatName: caseWhen(
							isNull(inspection.habitat_id),
							null,
							coalesce(habitat.habitat_name, concat(habitat.lat, ', ', habitat.lng)),
						),
						habitatTypeId: inspection.habitat_type_id,
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
