import { caseWhen, coalesce, gte, isNull, useLiveQuery } from '@tanstack/react-db';
import { profiles } from '../../lib/collections/profiles';
import { source_reduction_methods } from '../../lib/collections/source_reduction_methods';
import { source_reductions } from '../../lib/collections/source_reductions';
import { units } from '../../lib/collections/units';
import { PERFORMED_ACTIONS } from './performed-action-reads';
import type { RecentResult } from './recent-control-action-view';
import { activityGcTimeMs } from './shared';

const reductionReads = PERFORMED_ACTIONS.sourceReductions;

/** Source reductions performed on or after `sinceDate`, newest first. */
export function useRecentSourceReductions(sinceDate: string): RecentResult {
	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ action: source_reductions() })
				.where(({ action }) => gte(reductionReads.date(action), sinceDate))
				.join(
					{ method: source_reduction_methods() },
					({ action, method }) => reductionReads.joinMethod(action, method),
					'left',
				)
				.join(
					{ unit: units() },
					({ action, unit }) => reductionReads.joinUnit(action, unit),
					'left',
				)
				.join(
					{ technician: profiles() },
					({ action, technician }) => reductionReads.joinPerformer(action, technician),
					'left',
				)
				.orderBy(({ action }) => reductionReads.date(action), 'desc')
				.select(({ action, method, unit, technician }) => {
					const measured = reductionReads.measured(action);
					return {
						id: action.id,
						actionDate: reductionReads.date(action),
						methodId: measured.methodId,
						methodName: coalesce(method.name, 'Unknown method'),
						technicianProfileId: measured.performerProfileId,
						technicianName: caseWhen(
							isNull(measured.performerProfileId),
							null,
							technician.display_name,
						),
						amount: measured.amount,
						unitAbbreviation: coalesce(unit.abbreviation, null),
						habitatId: action.habitat_id,
						inspectionId: action.inspection_id,
					};
				}),
	});

	return { actions: result.data, isReady: result.isReady, isError: result.isError };
}
