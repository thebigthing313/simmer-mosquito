import { addCalendarDays } from '../../lib/local-date';
import { dateParam, type FilterCodecs } from '../../lib/search-filters';
import type { ActivityCopy } from '../activity/activity-data';
// The three rules Daily Work is: which day it is showing, what that day sends
// to the activity endpoint, and whether the path names a Profile at all.

/**
 * The day the page shows. `today` is the organization's today, and a future
 * day is pulled back to it, so a hand-typed or stale URL lands on a day that
 * can hold work.
 */
export function dailyWorkDay(requested: string, today: string): string {
	return requested === '' || requested > today ? today : requested;
}

/**
 * The day either side of the one on screen, for the stepper's two arrows.
 * Forward stops at today; backward has no floor.
 */
export function dailyWorkStep(day: string, days: number, today: string): string {
	return dailyWorkDay(addCalendarDays(day, days), today);
}

/**
 * One day, as the window the endpoint takes. `GET /map/profiles/:profileId/activity`
 * is a `dateFrom`/`dateTo` read, so a single day is both ends of it.
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
 * Whether the path segment could name a Profile. Ids are UUIDs, so anything
 * else is a mistyped link. The page still has to find the id among this
 * organization's own profiles.
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
	loadFailureBody: 'The read failed. Try again in a moment.',
};

/** The one search param the page reads: the day. */
export interface DailyWorkFilters {
	readonly date: string;
}

export const DAILY_WORK_FILTER_CODECS: FilterCodecs<DailyWorkFilters> = { date: dateParam };
