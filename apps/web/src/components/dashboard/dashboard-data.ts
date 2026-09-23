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

/** One person's day: how much they logged and when they last logged something. */
export interface PersonToday {
	readonly profileId: string;
	readonly records: number;
	/** ISO instant of the latest record. */
	readonly lastAt: string;
}

/**
 * Everyone who logged field work, most records first, then latest first, then
 * by id so the order is stable. One entry is one record in one role, so a
 * collection set and collected by the same person counts twice, which is what
 * the Activity Monitor lists for them.
 */
export function peopleByRecords(
	entries: readonly { readonly profileId: string; readonly recordedAt: string }[],
): readonly PersonToday[] {
	const byProfile = new Map<string, { records: number; lastAt: string }>();
	for (const entry of entries) {
		const person = byProfile.get(entry.profileId);
		if (person === undefined) {
			byProfile.set(entry.profileId, { records: 1, lastAt: entry.recordedAt });
		} else {
			person.records += 1;
			if (entry.recordedAt > person.lastAt) {
				person.lastAt = entry.recordedAt;
			}
		}
	}
	return [...byProfile]
		.map(([profileId, person]) => ({ profileId, ...person }))
		.sort(
			(a, b) =>
				b.records - a.records ||
				b.lastAt.localeCompare(a.lastAt) ||
				a.profileId.localeCompare(b.profileId),
		);
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

/** How the strip states a change against the 7 days before: as a count or as a percentage. */
export type ChangeMode = 'count' | 'percent';

/** A strip cell's change, as the chevron beside the count draws it. */
export interface ChangeLabel {
	readonly direction: 'up' | 'down' | 'same';
	/** `25`, `0`, `58%`, or `from 0` where a percentage has no base; the chevron carries the sign. */
	readonly text: string;
}

/**
 * The change from `prior` to `count`. The figure is unsigned, because the
 * chevron beside it is the sign. A count is the difference; a percentage is
 * the difference over `prior`, rounded to whole points, and over a prior of
 * zero it has no base, so a rise from nothing reads `from 0` rather than a
 * number.
 */
export function changeLabel(count: number, prior: number, mode: ChangeMode): ChangeLabel {
	const delta = count - prior;
	if (delta === 0) {
		return { direction: 'same', text: mode === 'count' ? '0' : '0%' };
	}
	const direction = delta > 0 ? 'up' : 'down';
	if (mode === 'count') {
		return { direction, text: `${Math.abs(delta)}` };
	}
	if (prior === 0) {
		return { direction, text: 'from 0' };
	}
	return { direction, text: `${Math.abs(Math.round((delta / prior) * 100))}%` };
}
