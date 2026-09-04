/**
 * The most recent Habitat Inspections, newest first, as many as asked for.
 *
 * The inspections table's read. It has no date window and no filters: the table
 * opens on the newest work and the reader extends the window by asking for more,
 * which is one number rather than a range to set before anything appears.
 *
 * ## Why the order is not decoration
 *
 * `inspections` is on-demand, and an `orderBy` with a `limit` over an on-demand
 * collection is what makes the window a server-side one. The compiler turns the
 * pair into a cursor, `compileSQL` sends `order_by` and `limit` to the shape
 * proxy, and `sync-shapes.ts` forwards both inside the forced org-scoped shape.
 * So Postgres does the sorting and the browser holds one window of rows. Raising
 * the limit asks for the next window rather than sorting a bigger pile locally.
 *
 * Both sort keys are columns of `inspections`. That is a constraint rather than a
 * preference: the cursor follows the *first* `orderBy` clause to whichever
 * collection it names, so sorting by a joined column, the inspector's name for
 * instance, would window `profiles` and leave the inspections side with no limit
 * at all. It returns the right rows in the right order and quietly loads the
 * whole filtered set to do it.
 *
 * The four joins are labels only. Two of them are eager tables the app already
 * holds; `habitats` and `addresses` are on-demand, and the compiler asks each for
 * the join keys this window produced rather than for the table.
 *
 * `useLiveQuery` rather than the suspense variant: the suspense hook hangs after
 * a navigation unmount over an on-demand collection.
 */

import { caseWhen, coalesce, concat, eq, isNull, useLiveQuery } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { habitat_types } from '../../lib/collections/habitat_types';
import { habitats } from '../../lib/collections/habitats';
import { inspections } from '../../lib/collections/inspections';
import { profiles } from '../../lib/collections/profiles';
import type { InspectionTableRow } from './larval-activity-view';

export function useInspectionTable(limit: number): {
	readonly rows: readonly InspectionTableRow[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery(
		{
			query: (query) =>
				query
					.from({ inspection: inspections() })
					// `left` throughout: an Ad Hoc Inspection has no Habitat, an inspection
					// need not name a type or an Address, and nobody may have been recorded
					// as inspector. An `inner` join would drop those rows off the table.
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
					// `created_at` breaks the tie and gets no column of its own. A day's
					// work is entered in the order it was done, so without it the rows
					// within a date come back in whatever order the engine keyed them and
					// move under the reader as the next window arrives.
					.orderBy(({ inspection }) => inspection.inspection_date, 'desc')
					.orderBy(({ inspection }) => inspection.created_at, 'desc')
					.limit(limit)
					.select(({ inspection, habitat, type, inspector, address }) => ({
						id: inspection.id,
						inspectionDate: inspection.inspection_date,
						inspectedByProfileId: inspection.inspected_by_profile_id,
						// Guarded on the inspection's own column rather than read off the
						// joined row: an unmatched `left` join yields `undefined` for every
						// `x.*`, and the guard is what turns that into the `null` this row
						// speaks in.
						inspectedByName: caseWhen(
							isNull(inspection.inspected_by_profile_id),
							null,
							inspector.display_name,
						),
						isWet: inspection.is_wet,
						dipCount: inspection.dip_count,
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

						address: {
							id: address.id,
							displayName: address.display_name,
							addressLine1: address.address_line_1,
							addressLine2: address.address_line_2,
							locality: address.locality,
							region: address.region,
							postalCode: address.postal_code,
						},

						hasEggs: inspection.has_eggs,
						hasFirstInstar: inspection.has_first_instar,
						hasSecondInstar: inspection.has_second_instar,
						hasThirdInstar: inspection.has_third_instar,
						hasFourthInstar: inspection.has_fourth_instar,
						hasPupae: inspection.has_pupae,
					})),
		},
		[limit],
	);

	return { rows: result.data, isReady: result.isReady, isError: result.isError };
}
