import { caseWhen, coalesce, gte, isNull, useLiveQuery } from '@tanstack/react-db';
import { biocontrol_actions } from '../../lib/collections/biocontrol_actions';
import { biocontrol_methods } from '../../lib/collections/biocontrol_methods';
import { profiles } from '../../lib/collections/profiles';
import { units } from '../../lib/collections/units';
import { PERFORMED_ACTIONS } from './performed-action-reads';
import type { RecentResult } from './recent-control-action-view';
import { activityGcTimeMs } from './shared';

const releaseReads = PERFORMED_ACTIONS.releases;

/** Biocontrol releases performed on or after `sinceDate`, newest first. */
export function useRecentBiocontrolActions(sinceDate: string): RecentResult {
	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ action: biocontrol_actions() })
				.where(({ action }) => gte(releaseReads.date(action), sinceDate))
				.join(
					{ method: biocontrol_methods() },
					({ action, method }) => releaseReads.joinMethod(action, method),
					'left',
				)
				.join({ unit: units() }, ({ action, unit }) => releaseReads.joinUnit(action, unit), 'left')
				.join(
					{ technician: profiles() },
					({ action, technician }) => releaseReads.joinPerformer(action, technician),
					'left',
				)
				.orderBy(({ action }) => releaseReads.date(action), 'desc')
				.select(({ action, method, unit, technician }) => {
					const measured = releaseReads.measured(action);
					return {
						id: action.id,
						actionDate: releaseReads.date(action),
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
