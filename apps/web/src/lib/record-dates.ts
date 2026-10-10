/**
 * The two calendar-day labels a record detail page draws.
 *
 * They were one file's worth of code written twice. `formatFullDate`,
 * `formatMonthDayYear` and `formatDateTime` were byte-identical in
 * `inspections/$id.tsx` and `samples/$id.tsx`, and so was the `parseDateOnly`
 * behind the first two, which was one of the ten hand-rolled calendar-date
 * parses #609 replaced. Nothing here changes what either page renders for a real
 * date; both copies are this one now, and this one is testable without loading a
 * route.
 *
 * It sat in `routes/larval-surveillance/` while those two pages were its only
 * callers. The collection detail page titles itself by a date too, so the rule
 * that a record's own date reads as `August 12, 2026` is a rule about detail
 * pages rather than about larval ones, and the module moved here to say so.
 *
 * The two date labels render on the UTC clock because an inspection date and a
 * sample date are calendar days: read as instants they land on the previous day
 * everywhere west of Greenwich. The third, `formatDateTime`, was the opposite: a
 * stamp is an instant, so it took the Organization's zone. It is the `dateTime`
 * style of `formatInstant` in `organization-clock.ts` now, beside the three other
 * copies of it (#1433).
 */

import { calendarDateParts, utcCalendarDay } from './local-date';
import { unreadable } from './unreadable-input';

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
	}).format(utcCalendarDay(parts));
}
