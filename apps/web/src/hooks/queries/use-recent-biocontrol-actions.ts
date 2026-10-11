import { gte, useLiveQuery } from '@tanstack/react-db';
import { biocontrol_actions } from '../../lib/collections/biocontrol_actions';
import { biocontrol_methods } from '../../lib/collections/biocontrol_methods';
import { profiles } from '../../lib/collections/profiles';
import { units } from '../../lib/collections/units';
import { PERFORMED_ACTIONS } from './performed-action-reads';
import type { RecentResult } from './recent-control-action-view';
import { joinedOrNull, liveQueryGcTimeMs } from './shared';

const releaseReads = PERFORMED_ACTIONS.releases;

/** Biocontrol releases performed on or after `sinceDate`, newest first. */
export function useRecentBiocontrolActions(sinceDate: string): RecentResult {
	const result = useLiveQuery({
		gcTime: liveQueryGcTimeMs,
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
						methodName: joinedOrNull(method.name),
						technicianProfileId: measured.performerProfileId,
						technicianName: joinedOrNull(technician.display_name),
						amount: measured.amount,
						unitAbbreviation: joinedOrNull(unit.abbreviation),
						habitatId: action.habitat_id,
						inspectionId: action.inspection_id,
					};
				}),
	});

	return { actions: result.data, isReady: result.isReady, isError: result.isError };
}
