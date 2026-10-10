/**
 * Outreach performed over a recent window, newest first, with what it was and
 * who did it.
 *
 * Windowed on `outreach_date`, a `date` column, so the bound is a plain
 * `YYYY-MM-DD` string — no zone, no instant.
 */

import { coalesce, gte, useLiveQuery } from '@tanstack/react-db';
import { outreach_actions } from '../../lib/collections/outreach_actions';
import { outreach_methods } from '../../lib/collections/outreach_methods';
import { profiles } from '../../lib/collections/profiles';
import { PERFORMED_ACTIONS } from './performed-action-reads';
import { activityGcTimeMs } from './shared';

const outreachReads = PERFORMED_ACTIONS.outreachActions;

/** One outreach action as a recent-activity list shows it. */
export interface RecentOutreachAction {
	readonly id: string;
	readonly outreachDate: string;
	readonly methodId: string;
	/** `null` while the method is not in the client. */
	readonly methodName: string | null;
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
	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ action: outreach_actions() })
				.where(({ action }) => gte(outreachReads.date(action), sinceDate))
				.join(
					{ method: outreach_methods() },
					({ action, method }) => outreachReads.joinMethod(action, method),
					'left',
				)
				.join(
					{ technician: profiles() },
					({ action, technician }) => outreachReads.joinPerformer(action, technician),
					'left',
				)
				.orderBy(({ action }) => outreachReads.date(action), 'desc')
				.select(({ action, method, technician }) => {
					const measured = outreachReads.measured(action);
					return {
						id: action.id,
						outreachDate: outreachReads.date(action),
						methodId: measured.methodId,
						methodName: coalesce(method.name, null),
						technicianProfileId: measured.performerProfileId,
						technicianName: coalesce(technician.display_name, null),
						reach: measured.amount,
						reachDescription: action.reach_description,
					};
				}),
	});

	return { actions: result.data, isReady: result.isReady, isError: result.isError };
}
