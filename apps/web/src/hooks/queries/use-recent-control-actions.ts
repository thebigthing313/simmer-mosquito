/**
 * Source reductions and biocontrol releases over a recent window, newest first.
 *
 * The two right-hand panels of the control-operations overview, which read the
 * same window and differ only in which table they read. Two hooks in one file
 * rather than two files, because they are one shape asked of two tables — and one
 * of them is the exception `shared.ts` allows itself: a file here that is not a
 * single `use-` hook. Splitting them would duplicate the whole comment.
 *
 * Both are windowed on a `date` column, so the bound is a plain `YYYY-MM-DD`
 * string — no zone, no instant. See `use-recent-collections.ts` for the adult
 * case, where it is neither.
 */

import { caseWhen, coalesce, eq, gte, isNull, useLiveQuery } from '@tanstack/react-db';
import { biocontrol_actions } from '../../lib/collections/biocontrol_actions';
import { biocontrol_methods } from '../../lib/collections/biocontrol_methods';
import { profiles } from '../../lib/collections/profiles';
import { source_reduction_methods } from '../../lib/collections/source_reduction_methods';
import { source_reductions } from '../../lib/collections/source_reductions';
import { units } from '../../lib/collections/units';
import { activityGcTimeMs } from './shared';

/** One control action as a recent-activity list shows it. */
export interface RecentControlAction {
	readonly id: string;
	readonly actionDate: string;
	readonly methodId: string;
	readonly methodName: string;
	readonly technicianProfileId: string | null;
	readonly technicianName: string | null;
	readonly amount: number;
	readonly unitAbbreviation: string | null;
	readonly habitatId: string | null;
	readonly inspectionId: string | null;
}

interface RecentResult {
	readonly actions: readonly RecentControlAction[];
	readonly isReady: boolean;
	readonly isError: boolean;
}

/** Source reductions performed on or after `sinceDate`, newest first. */
export function useRecentSourceReductions(sinceDate: string): RecentResult {
	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ action: source_reductions() })
					.where(({ action }) => gte(action.source_reduction_date, sinceDate))
					.join(
						{ method: source_reduction_methods() },
						({ action, method }) => eq(action.source_reduction_method_id, method.id),
						'left',
					)
					.join(
						{ unit: units() },
						({ action, unit }) => eq(action.sources_eliminated_unit_id, unit.id),
						'left',
					)
					.join(
						{ technician: profiles() },
						({ action, technician }) => eq(action.technician_profile_id, technician.id),
						'left',
					)
					.orderBy(({ action }) => action.source_reduction_date, 'desc')
					.select(({ action, method, unit, technician }) => ({
						id: action.id,
						actionDate: action.source_reduction_date,
						methodId: action.source_reduction_method_id,
						methodName: coalesce(method.name, 'Unknown method'),
						technicianProfileId: action.technician_profile_id,
						technicianName: caseWhen(
							isNull(action.technician_profile_id),
							null,
							technician.display_name,
						),
						amount: action.sources_eliminated_amount,
						unitAbbreviation: coalesce(unit.abbreviation, null),
						habitatId: action.habitat_id,
						inspectionId: action.inspection_id,
					})),
		},
		[sinceDate],
	);

	return { actions: result.data, isReady: result.isReady, isError: result.isError };
}

/** Biocontrol releases made on or after `sinceDate`, newest first. */
export function useRecentBiocontrolActions(sinceDate: string): RecentResult {
	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ action: biocontrol_actions() })
					.where(({ action }) => gte(action.biocontrol_date, sinceDate))
					.join(
						{ method: biocontrol_methods() },
						({ action, method }) => eq(action.biocontrol_method_id, method.id),
						'left',
					)
					.join(
						{ unit: units() },
						({ action, unit }) => eq(action.release_unit_id, unit.id),
						'left',
					)
					.join(
						{ technician: profiles() },
						({ action, technician }) => eq(action.technician_profile_id, technician.id),
						'left',
					)
					.orderBy(({ action }) => action.biocontrol_date, 'desc')
					.select(({ action, method, unit, technician }) => ({
						id: action.id,
						actionDate: action.biocontrol_date,
						methodId: action.biocontrol_method_id,
						methodName: coalesce(method.name, 'Unknown method'),
						technicianProfileId: action.technician_profile_id,
						technicianName: caseWhen(
							isNull(action.technician_profile_id),
							null,
							technician.display_name,
						),
						amount: action.amount_released,
						unitAbbreviation: coalesce(unit.abbreviation, null),
						habitatId: action.habitat_id,
						inspectionId: action.inspection_id,
					})),
		},
		[sinceDate],
	);

	return { actions: result.data, isReady: result.isReady, isError: result.isError };
}
