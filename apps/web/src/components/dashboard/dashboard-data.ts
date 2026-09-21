/**
 * The Dashboard's server half as the page reads it, and the arithmetic the
 * page does on dates. One `useQuery` for `GET /dashboard` answers every panel
 * the client cannot read off a synced table, refreshed on focus and every five
 * minutes. The wire types are written here because `apps/web` has no
 * dependency on `packages/db`; `DashboardResponse` in
 * `packages/db/src/domains/dashboard.ts` is the other half.
 * `docs/dashboard-spec.md` is the rest.
 */

/** A pending queue: how many, and the date of the oldest. */
export interface QueueCount {
	readonly count: number;
	/** `YYYY-MM-DD` in the Organization's zone; null when the count is 0. */
	readonly oldest: string | null;
}

/** One strip cell: the 7-day count and the 7 before it. */
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

/** The eight activity types, in strip order. `useActivityStrip` counts each off its own table. */
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
	readonly peopleToday: readonly PersonToday[];
}

// --- the arithmetic ----------------------------------------------------------

/**
 * Calendar days from `date` to `today`, both `YYYY-MM-DD` in the same zone,
 * computed in UTC. Never negative.
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
