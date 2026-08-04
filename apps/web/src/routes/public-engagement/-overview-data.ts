import type { ServiceRequestRow } from '@simmer-mosquito/sync';
import { eq, gte, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { webCollections } from '../../sync/webCollections';
import { isServiceRequestOpen } from './-public-engagement-display';

// The public-engagement overview reads entirely from synced collections. Both
// service_requests and outreach_actions are on-demand shapes (docs/sync.md), so
// each hook bounds its subset — by organization for requests, by date for
// outreach — and uses the status-gated `useLiveQuery`, not the suspense variant,
// which hangs after a navigation unmount over on-demand collections.

// Pure date helpers are shared with the surveillance overviews; re-exported here
// so every domain builds its windows from one implementation.
export {
	addDaysToDateString,
	formatMonthDay,
	todayInTimeZone,
} from '../larval-surveillance/-overview-data';

/** How far back the recent outreach panel reaches. */
export const OUTREACH_ACTIVITY_WINDOW_DAYS = 14;

const overviewGcTimeMs = 30_000;

interface LoadState {
	readonly isReady: boolean;
	readonly isError: boolean;
}

/**
 * The organization's open service requests, newest first.
 *
 * Open/closed is decided here rather than in the query: `closedAt` is a
 * timestamp, not a flag, and the one org-scoped subset already drives the
 * request count on the summary card.
 */
export function useOpenServiceRequests(organizationId: string): {
	readonly openRequests: readonly ServiceRequestRow[];
	readonly openCount: number;
} & LoadState {
	const result = useLiveQuery(
		{
			gcTime: overviewGcTimeMs,
			query: (query) =>
				query
					.from({ request: webCollections.serviceRequests })
					.where(({ request }) => eq(request.organizationId, organizationId))
					.orderBy(({ request }) => request.requestDate, 'desc'),
		},
		[organizationId],
	);

	const openRequests = useMemo(
		() =>
			((result.data ?? []) as readonly ServiceRequestRow[]).filter((request) =>
				isServiceRequestOpen(request),
			),
		[result.data],
	);

	return {
		openRequests,
		openCount: openRequests.length,
		isReady: result.isReady,
		isError: result.isError,
	};
}

export interface RecentOutreachAction {
	readonly id: string;
	readonly outreachMethodId: string;
	readonly technicianProfileId: string | null;
	readonly outreachDate: string;
	readonly reach: number;
	readonly reachDescription: string | null;
}

/** Outreach performed on or after `sinceDate` (a `YYYY-MM-DD`), newest first. */
export function useRecentOutreachActions(sinceDate: string): {
	readonly outreachActions: readonly RecentOutreachAction[];
} & LoadState {
	const result = useLiveQuery(
		{
			gcTime: overviewGcTimeMs,
			query: (query) =>
				query
					.from({ outreach: webCollections.outreachActions })
					.where(({ outreach }) => gte(outreach.outreachDate, sinceDate))
					.orderBy(({ outreach }) => outreach.outreachDate, 'desc')
					.select(({ outreach }) => ({
						id: outreach.id,
						outreachMethodId: outreach.outreachMethodId,
						technicianProfileId: outreach.technicianProfileId,
						outreachDate: outreach.outreachDate,
						reach: outreach.reach,
						reachDescription: outreach.reachDescription,
					})),
		},
		[sinceDate],
	);

	return {
		outreachActions: (result.data ?? []) as unknown as readonly RecentOutreachAction[],
		isReady: result.isReady,
		isError: result.isError,
	};
}
