/**
 * Outreach performed over a recent window, newest first, with what it was and
 * who did it.
 *
 * Windowed on `outreach_date`, a `date` column, so the bound is a plain
 * `YYYY-MM-DD` string — no zone, no instant.
 */

import { caseWhen, coalesce, eq, gte, isNull, useLiveQuery } from '@tanstack/react-db';
import { outreach_actions } from '../../lib/collections/outreach_actions';
import { outreach_methods } from '../../lib/collections/outreach_methods';
import { profiles } from '../../lib/collections/profiles';
import { activityGcTimeMs } from './shared';

/** One outreach action as a recent-activity list shows it. */
export interface RecentOutreachAction {
	readonly id: string;
	readonly outreachDate: string;
	readonly methodId: string;
	readonly methodName: string;
	readonly technicianProfileId: string | null;
	readonly technicianName: string | null;
	readonly reach: number;
	readonly reachDescription: string | null;
}

export function useRecentOutreachActions(sinceDate: string): {
	readonly actions: readonly RecentOutreachAction[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ action: outreach_actions })
					.where(({ action }) => gte(action.outreach_date, sinceDate))
					.join(
						{ method: outreach_methods },
						({ action, method }) => eq(action.outreach_method_id, method.id),
						'left',
					)
					.join(
						{ technician: profiles },
						({ action, technician }) => eq(action.technician_profile_id, technician.id),
						'left',
					)
					.orderBy(({ action }) => action.outreach_date, 'desc')
					.select(({ action, method, technician }) => ({
						id: action.id,
						outreachDate: action.outreach_date,
						methodId: action.outreach_method_id,
						methodName: coalesce(method.name, 'Unknown method'),
						technicianProfileId: action.technician_profile_id,
						technicianName: caseWhen(
							isNull(action.technician_profile_id),
							null,
							technician.display_name,
						),
						reach: action.reach,
						reachDescription: action.reach_description,
					})),
		},
		[sinceDate],
	);

	return { actions: result.data, isReady: result.isReady, isError: result.isError };
}
