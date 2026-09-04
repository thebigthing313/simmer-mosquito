import type { ActivityCopy } from '../-activity-monitor-data';

// The three rules Daily Work is: which day it is showing, what that day sends to
// the activity endpoint, and whether the path names a Profile at all.
// Dash-prefixed so TanStack Router ignores this file as a route.

/**
 * The day the page shows.
 *
 * `today` is already the agency's today rather than the browser's, so a
 * supervisor two zones away opens the same day a collector on the road does.
 * A future day is pulled back to today: the picker refuses to select one, and a
 * hand-typed or stale URL must land on a day that can hold work rather than on
 * an empty page that reads as a quiet one.
 */
export function dailyWorkDay(requested: string, today: string): string {
	return requested === '' || requested > today ? today : requested;
}

/**
 * One day, as the window the endpoint takes.
 *
 * `GET /map/profiles/:profileId/activity` is a `dateFrom`/`dateTo` read, so a
 * single day is both ends of it. Named rather than spelled inline at the call
 * site, because "both ends are the same day" is the whole difference between
 * this page and the range it came from.
 */
export function dailyWorkWindow(
	profileId: string,
	day: string,
): {
	readonly profileId: string | null;
	readonly dateFrom: string;
	readonly dateTo: string;
} {
	return { profileId, dateFrom: day, dateTo: day };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether the path segment could name a Profile.
 *
 * Ids are UUIDs, so anything else is a mistyped or truncated link and is worth
 * saying so before a read goes out for it. It is only the cheap half: the page
 * still has to find the id among the agency's own profiles, because a valid
 * UUID belonging to another agency is the same wrong link.
 */
export function isProfileId(value: string): boolean {
	return UUID.test(value);
}

/** Daily Work's wording: one day, with no second end to move. */
export const DAILY_WORK_COPY: ActivityCopy = {
	empty: {
		title: 'Nothing recorded on this day',
		body: 'Pick another day to see this person’s field work.',
	},
	refusalTitle: 'That day was not read',
	truncationAdvice: null,
};
