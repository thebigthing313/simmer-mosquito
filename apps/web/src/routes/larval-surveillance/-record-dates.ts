/**
 * The three date labels an Inspection detail page and a Sample detail page both
 * draw.
 *
 * They were one file's worth of code written twice. `formatFullDate`,
 * `formatMonthDayYear` and `formatDateTime` were byte-identical in
 * `inspections/$id.tsx` and `samples/$id.tsx`, and so was the `parseDateOnly`
 * behind the first two, which was one of the ten hand-rolled calendar-date
 * parses #609 replaced. Nothing here changes what either page renders for a real
 * date; both copies are this one now, and this one is testable without loading a
 * route.
 *
 * Dash-prefixed so TanStack Router ignores it as a route.
 *
 * The two date labels render on the UTC clock because an inspection date and a
 * sample date are calendar days: read as instants they land on the previous day
 * everywhere west of Greenwich. {@link formatDateTime} is the opposite, and takes
 * the organization's zone, because a stamp is an instant and the question is
 * what the clock read where the work happened.
 */

import { calendarDateParts } from '../../lib/local-date';
import { unreadable } from '../../lib/unreadable-input';

/** Long-form date from a `YYYY-MM-DD` string: `August 12, 2026`. */
export function formatFullDate(date: string): string {
	return utcDate('formatFullDate', date, { month: 'long' });
}

/** The same day, shortened for a breadcrumb or a table cell: `Aug 12, 2026`. */
export function formatMonthDayYear(date: string): string {
	return utcDate('formatMonthDayYear', date, { month: 'short' });
}

/**
 * The two above, which differ only in how much of the month they write.
 *
 * The year and the day are not the caller's to choose: a detail page names one
 * record, and a date on it without a year is a date somebody has to place
 * against the season themselves.
 */
function utcDate(
	formatter: string,
	date: string,
	options: { readonly month: 'long' | 'short' },
): string {
	const parts = calendarDateParts(date);
	if (parts === undefined) {
		return unreadable(formatter, date);
	}
	return new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: options.month,
		day: 'numeric',
		timeZone: 'UTC',
	}).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}

/**
 * A stored instant on the organization's clock: `Aug 12, 2026, 4:30 PM`.
 *
 * It answered `Unknown` for a value it could not read, which said only that
 * something was wrong. The value goes back on screen instead, which at least
 * says what.
 *
 * No zone means the reader's own, which is what a page shows before the
 * organization's settings have arrived.
 */
export function formatDateTime(value: string, timeZone: string | undefined): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return unreadable('formatDateTime', value);
	}
	return new Intl.DateTimeFormat(undefined, {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		...(timeZone === undefined ? {} : { timeZone }),
	}).format(date);
}
