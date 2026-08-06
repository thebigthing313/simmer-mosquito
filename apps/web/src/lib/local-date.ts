/**
 * Calendar dates, in the agency's local time.
 *
 * A date column here is a *calendar date* — the day an inspection happened, the
 * day an assignment is scheduled for — not an instant. `new Date('2026-08-04')`
 * parses as UTC midnight, which is the previous day everywhere west of
 * Greenwich, so the parts are read out and handed to the local constructor
 * instead. Nine copies of this pair had accumulated across the record forms
 * before it was named once.
 */

/** A `YYYY-MM-DD` string as a local Date, or undefined when empty or malformed. */
export function parseLocalDate(value: string | null | undefined): Date | undefined {
	if (value === null || value === undefined || value === '') {
		return undefined;
	}
	const [yearPart, monthPart, dayPart] = value.slice(0, 10).split('-');
	if (yearPart === undefined || monthPart === undefined || dayPart === undefined) {
		return undefined;
	}
	const year = Number.parseInt(yearPart, 10);
	const month = Number.parseInt(monthPart, 10);
	const day = Number.parseInt(dayPart, 10);
	if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
		return undefined;
	}
	const date = new Date(year, month - 1, day);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

/** A local Date back to `YYYY-MM-DD`, reading the local parts rather than the UTC ones. */
export function formatLocalDate(date: Date): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, '0');
	const day = `${date.getDate()}`.padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * The start of a local calendar day as a lower bound for a `timestamptz` column.
 *
 * A bare `YYYY-MM-DD` cannot be compared against a `timestamptz` in a sync
 * predicate: Postgres would cast it, but Electric rejects it outright with
 * `invalid syntax for type timestamptz`, and the whole shape request 400s.
 *
 * The bound is also evaluated a second time, in the browser — TanStack DB re-runs
 * the same `where` as a plain JS `>=` over the raw strings Electric streams, which
 * look like `2026-07-24 06:12:33.481+00`. So the format has to match those
 * character for character (space separator, `+00` offset, no `T` or `Z`) or the
 * two comparisons disagree and same-day rows arrive from the server only to be
 * filtered out on the client.
 *
 * An unreadable date yields the epoch — an effectively absent lower bound, which
 * shows too much rather than silently showing nothing.
 */
export function localDayStartAsTimestamp(date: string | null | undefined): string {
	const start = parseLocalDate(date) ?? new Date(0);
	const iso = start.toISOString();
	return `${iso.slice(0, 10)} ${iso.slice(11, 19)}+00`;
}
