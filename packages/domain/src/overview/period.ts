/**
 * The three grains a period-in-review page reads at, how a period is spelled
 * at each, and the calendar arithmetic the cut needs.
 *
 * `docs/today-spec.md` is the brief. Everything here is pure and shared by
 * the reader in `packages/db`, the route in `apps/server` and the three pages
 * in `apps/web`, which is why it is in the domain: the server refuses a
 * malformed or future period and the client rewrites one before asking, and
 * both read the same rule.
 *
 * Every date is a `YYYY-MM-DD` string and every calculation runs on the UTC
 * clock, because a calendar date has no zone until somebody asks which
 * instant it starts at, and nothing here asks. `today` is passed in, in the
 * Organization's zone, and is never read off a clock.
 */

export const OVERVIEW_GRAINS = ['day', 'month', 'year'] as const;

/** The day, the calendar month and the calendar year. */
export type OverviewGrain = (typeof OVERVIEW_GRAINS)[number];

export function isOverviewGrain(value: string): value is OverviewGrain {
	return (OVERVIEW_GRAINS as readonly string[]).includes(value);
}

/**
 * The query parameter each grain's period rides in, on the endpoint and on
 * the page: `/overview/day?date=`, `/today?date=`, and so on.
 */
export const OVERVIEW_PERIOD_PARAM: Readonly<Record<OverviewGrain, 'date' | 'month' | 'year'>> = {
	day: 'date',
	month: 'month',
	year: 'year',
};

/**
 * The earliest year a period may name, the same floor `validateLocalDate`
 * holds every written date to. A period before it is malformed rather than
 * early, because nothing can be dated there.
 */
export const OVERVIEW_PERIOD_FLOOR_YEAR = 1900;

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const YEAR_PATTERN = /^(\d{4})$/;

export interface CalendarDate {
	readonly year: number;
	readonly month: number;
	readonly day: number;
}

export function pad2(value: number): string {
	return `${value}`.padStart(2, '0');
}

export function formatCalendarDate(date: CalendarDate): string {
	return `${date.year}-${pad2(date.month)}-${pad2(date.day)}`;
}

/** `YYYY-MM-DD` read apart, or null when it is not a real calendar date. */
export function parseCalendarDate(value: string): CalendarDate | null {
	const match = DAY_PATTERN.exec(value);
	if (match === null) {
		return null;
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
		return null;
	}
	return { year, month, day };
}

export function daysInMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `date` shifted by whole days. */
export function addDays(date: string, days: number): string {
	const parts = parseCalendarDate(date);
	if (parts === null) {
		throw new Error(`Not a calendar date: ${date}`);
	}
	const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
	return formatCalendarDate({
		year: shifted.getUTCFullYear(),
		month: shifted.getUTCMonth() + 1,
		day: shifted.getUTCDate(),
	});
}

/**
 * The same day of the month in another month, clamped to that month's last
 * day. This is the cut rule: a partial period compares against the same
 * calendar date within each earlier period, so Feb 29 reads as Feb 28 in a
 * common year and the 31st reads as the whole of a shorter month.
 */
export function clampedDay(year: number, month: number, day: number): string {
	return formatCalendarDate({ year, month, day: Math.min(day, daysInMonth(year, month)) });
}

/** The current period at a grain, spelled the way its page spells it. */
export function currentOverviewPeriod(grain: OverviewGrain, today: string): string {
	switch (grain) {
		case 'day':
			return today;
		case 'month':
			return today.slice(0, 7);
		case 'year':
			return today.slice(0, 4);
	}
}

/**
 * The period a request names, normalised: the current period when `raw` is
 * absent, the value when it is well formed and not in the future, and null
 * otherwise. Null is the server's 400 and the client's rewrite to the current
 * period; a period before `earliest` is not null, because it is a real period
 * that happens to hold nothing.
 */
export function parseOverviewPeriod(
	grain: OverviewGrain,
	raw: string | undefined,
	today: string,
): string | null {
	if (raw === undefined) {
		return currentOverviewPeriod(grain, today);
	}
	if (!isWellFormedPeriod(grain, raw)) {
		return null;
	}
	return raw > currentOverviewPeriod(grain, today) ? null : raw;
}

function isWellFormedPeriod(grain: OverviewGrain, raw: string): boolean {
	switch (grain) {
		case 'day': {
			const parts = parseCalendarDate(raw);
			return parts !== null && parts.year >= OVERVIEW_PERIOD_FLOOR_YEAR;
		}
		case 'month': {
			const match = MONTH_PATTERN.exec(raw);
			if (match === null) {
				return false;
			}
			const month = Number(match[2]);
			return Number(match[1]) >= OVERVIEW_PERIOD_FLOOR_YEAR && month >= 1 && month <= 12;
		}
		case 'year':
			return YEAR_PATTERN.test(raw) && Number(raw) >= OVERVIEW_PERIOD_FLOOR_YEAR;
	}
}

/** The year a well-formed period at any grain falls in. */
export function overviewPeriodYear(period: string): number {
	return Number(period.slice(0, 4));
}

/** The month of a well-formed day or month period. */
export function overviewPeriodMonth(period: string): number {
	return Number(period.slice(5, 7));
}

/**
 * The whole span of a period, first day to last day, which is what a count
 * link writes: `to` is the period's last day even when the period is partial,
 * since a future date matches nothing in an explorer and the link copied
 * tomorrow still names the month.
 */
export function overviewPeriodSpan(
	grain: OverviewGrain,
	period: string,
): { readonly from: string; readonly to: string } {
	switch (grain) {
		case 'day':
			return { from: period, to: period };
		case 'month': {
			const year = overviewPeriodYear(period);
			const month = overviewPeriodMonth(period);
			return { from: `${period}-01`, to: clampedDay(year, month, 31) };
		}
		case 'year':
			return { from: `${period}-01-01`, to: `${period}-12-31` };
	}
}

/**
 * Whether `today` falls inside the period. Only the current period is ever
 * partial; a past period picked in the picker compares whole against whole.
 */
export function isPartialOverviewPeriod(
	grain: OverviewGrain,
	period: string,
	today: string,
): boolean {
	return period === currentOverviewPeriod(grain, today);
}

/** How many years the average column reaches back. */
export const OVERVIEW_AVERAGE_YEARS = 5;

/**
 * The daily rows the reader has to fetch for one read: the qualifying-year
 * test, every column and the series in one pass. On `day` and `month` the
 * lower bound is Jan 1 five years before the picked period's year; on `year`
 * there is none, because the series is the whole history. The upper bound is
 * the series' end, which never passes today.
 */
export function overviewScanWindow(
	grain: OverviewGrain,
	period: string,
	today: string,
): { readonly from: string | null; readonly to: string } {
	const year = overviewPeriodYear(period);
	const to = grain === 'year' ? today : minDate(`${year}-12-31`, today);
	return {
		from: grain === 'year' ? null : `${year - OVERVIEW_AVERAGE_YEARS}-01-01`,
		to,
	};
}

export function minDate(a: string, b: string): string {
	return a < b ? a : b;
}
