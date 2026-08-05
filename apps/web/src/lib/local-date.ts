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
