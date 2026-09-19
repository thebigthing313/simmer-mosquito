import { caseWhen, coalesce, eq, gte, isNull, useLiveQuery } from '@tanstack/react-db';
import { profiles } from '../../lib/collections/profiles';
import { source_reduction_methods } from '../../lib/collections/source_reduction_methods';
import { source_reductions } from '../../lib/collections/source_reductions';
import { units } from '../../lib/collections/units';
import type { RecentResult } from './recent-control-action-view';
import { activityGcTimeMs } from './shared';

/** Source reductions performed on or after `sinceDate`, newest first. */
export function useRecentSourceReductions(sinceDate: string): RecentResult {
	const result = useLiveQuery({
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
	});

	return { actions: result.data, isReady: result.isReady, isError: result.isError };
}
