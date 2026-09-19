import { caseWhen, coalesce, eq, gte, isNull, useLiveQuery } from '@tanstack/react-db';
import { biocontrol_actions } from '../../lib/collections/biocontrol_actions';
import { biocontrol_methods } from '../../lib/collections/biocontrol_methods';
import { profiles } from '../../lib/collections/profiles';
import { units } from '../../lib/collections/units';
import type { RecentResult } from './recent-control-action-view';
import { activityGcTimeMs } from './shared';

/** Biocontrol releases performed on or after `sinceDate`, newest first. */
export function useRecentBiocontrolActions(sinceDate: string): RecentResult {
	const result = useLiveQuery({
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
				.join({ unit: units() }, ({ action, unit }) => eq(action.release_unit_id, unit.id), 'left')
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
	});

	return { actions: result.data, isReady: result.isReady, isError: result.isError };
}
