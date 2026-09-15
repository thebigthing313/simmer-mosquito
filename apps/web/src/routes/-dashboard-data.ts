/**
 * The Dashboard's server half as the page reads it, and the arithmetic the
 * page does on dates.
 *
 * One `useQuery` for `GET /dashboard`, which answers every panel the client
 * cannot read off a synced table: the two awaiting queues, the unassigned
 * requests, the untreated flag, the activity strip and the people in the field
 * today. One query is one timer, which is why five panels are one endpoint
 * rather than five, and why the page carries no refresh control: focus and the
 * five-minute interval are the cadence. `docs/dashboard-spec.md` is the rest.
 *
 * The wire types are written here rather than imported: `apps/web` has no
 * dependency on `packages/db`, and an edge from the browser app to the Kysely
 * package to type one response is the worse trade. `DashboardResponse` in
 * `packages/db/src/domains/dashboard.ts` is the other half, and the route suite
 * in `apps/server` holds the shape.
 */

import { sessionFetch } from '@simmer-mosquito/sync';
import { useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../auth';

/** A pending queue: how many, and the date of the oldest. */
export interface QueueCount {
	readonly count: number;
	/** `YYYY-MM-DD` in the Organization's zone; null when the count is 0. */
	readonly oldest: string | null;
}

export interface ActivityCount {
	readonly count: number;
	readonly prior: number;
}

export interface PersonToday {
	readonly profileId: string;
	readonly records: number;
	/** ISO instant of the latest record. */
	readonly lastAt: string;
}

export interface DateWindow {
	readonly from: string;
	readonly to: string;
}

/** The eight activity types, in strip order. */
export const ACTIVITY_TYPE_KEYS = [
	'inspections',
	'samples',
	'collections',
	'applications',
	'sourceReductions',
	'releases',
	'serviceRequests',
	'outreachActions',
] as const;

export type ActivityTypeKey = (typeof ACTIVITY_TYPE_KEYS)[number];

export interface DashboardResponse {
	/** `YYYY-MM-DD` in the Organization's zone. */
	readonly today: string;
	readonly queues: {
		readonly samplesAwaiting: QueueCount;
		readonly collectionsAwaiting: QueueCount;
		readonly requestsUnassigned: QueueCount;
	};
	readonly untreatedHabitats: QueueCount;
	readonly activity: {
		readonly window: DateWindow;
		readonly priorWindow: DateWindow;
		/** `null` is a type the Organization has never recorded, and is not a cell. */
		readonly types: Readonly<Record<ActivityTypeKey, ActivityCount | null>>;
	};
	readonly peopleToday: readonly PersonToday[];
}

/** Five minutes: the interval the server half is re-read on. */
const DASHBOARD_REFETCH_INTERVAL_MS = 5 * 60_000;

export function useDashboard(): {
	readonly data: DashboardResponse | undefined;
	readonly isLoading: boolean;
	readonly isError: boolean;
} {
	const query = useQuery({
		queryKey: ['dashboard'],
		queryFn: ({ signal }) => fetchDashboard(signal),
		// The app's default is `false`; this page is opened and left open, and
		// the tab coming back into focus is the moment a stale number matters.
		refetchOnWindowFocus: true,
		refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS,
		placeholderData: (previous) => previous,
	});

	return { data: query.data, isLoading: query.isLoading, isError: query.isError };
}

async function fetchDashboard(signal: AbortSignal): Promise<DashboardResponse> {
	const response = await sessionFetch(new URL('/dashboard', getServerUrl()), { signal });
	if (!response.ok) {
		throw new Error(`Dashboard request failed (${response.status}).`);
	}
	return (await response.json()) as DashboardResponse;
}

// --- the arithmetic ----------------------------------------------------------

/**
 * Calendar days from `date` to `today`, both `YYYY-MM-DD` in the same zone.
 *
 * UTC throughout, because both are already calendar days and no zone should
 * move either. Never negative: a row dated after today, which the domain
 * refuses but a clock could produce, reads as today rather than as a negative
 * age.
 */
export function ageInDays(date: string, today: string): number {
	const from = Date.parse(`${date}T00:00:00Z`);
	const to = Date.parse(`${today}T00:00:00Z`);
	if (Number.isNaN(from) || Number.isNaN(to)) {
		return 0;
	}
	return Math.max(0, Math.round((to - from) / 86_400_000));
}

/** `today`, `1 day` or `N days`. */
export function ageLabel(days: number): string {
	if (days === 0) {
		return 'today';
	}
	return days === 1 ? '1 day' : `${days} days`;
}

/** The delta chip's words: `+25`, `-13` or `same`. */
export function deltaLabel(count: number, prior: number): string {
	const delta = count - prior;
	if (delta === 0) {
		return 'same';
	}
	return delta > 0 ? `+${delta}` : `${delta}`;
}
