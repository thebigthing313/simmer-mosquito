/**
 * The columns and the series of one `GET /overview/:grain` answer, computed
 * from daily rows. `docs/today-spec.md`, "Partial periods and the cut" and
 * "The average column", is the arithmetic this writes down.
 *
 * Pure on purpose. The cut is where the bugs will be, and a function over
 * daily rows takes a table-driven suite with no database: Feb 29 against
 * Feb 28, a March 31 read against a whole February, January's previous month,
 * a year qualifying on one stray row, the zero divisor. Doing the cut in SQL
 * with a `filter` clause per column was the alternative, eight predicates per
 * statement with the leap-year rule where nothing unit-tests it.
 */

import {
	OVERVIEW_RATIO_TYPES,
	OVERVIEW_RATIOS,
	OVERVIEW_RECORD_TYPES,
	type OverviewColumn,
	type OverviewDailyRow,
	type OverviewRatio,
	type OverviewRatioPoint,
	type OverviewRatioRow,
	type OverviewRecordType,
	type OverviewResponse,
	type OverviewSeriesPoint,
	type OverviewTypeRow,
} from './overview.js';
import {
	addDays,
	clampedDay,
	currentOverviewPeriod,
	daysInMonth,
	isPartialOverviewPeriod,
	minDate,
	OVERVIEW_AVERAGE_YEARS,
	type OverviewGrain,
	overviewPeriodMonth,
	overviewPeriodSpan,
	overviewPeriodYear,
	pad2,
	parseCalendarDate,
} from './period.js';

export interface AggregateOverviewInput {
	readonly grain: OverviewGrain;
	/** A period `parseOverviewPeriod` accepted. */
	readonly period: string;
	/** `YYYY-MM-DD` in the Organization's zone. */
	readonly today: string;
	/** The daily rows per type, inside `overviewScanWindow`, in any order. */
	readonly rows: Readonly<Record<OverviewRecordType, readonly OverviewDailyRow[]>>;
	/** Each type's earliest dated record, null when it has none. */
	readonly earliest: Readonly<Record<OverviewRecordType, string | null>>;
}

interface Window {
	readonly from: string;
	readonly to: string;
}

/** A real column's window, or the average column's per-year windows. */
type ColumnPlan =
	| { readonly key: 'period' | 'previous' | 'lastYear'; readonly window: Window }
	| {
			readonly key: 'average';
			readonly years: readonly { readonly year: number; readonly window: Window }[];
	  };

export function aggregateOverview(input: AggregateOverviewInput): OverviewResponse {
	const { grain, period, today } = input;
	const partial = isPartialOverviewPeriod(grain, period, today);
	const plans = columnPlans(grain, period, today, partial);
	const earliest = leastOf(OVERVIEW_RECORD_TYPES.map((type) => input.earliest[type]));
	const seriesPeriods = seriesPeriodsFor(grain, period, today, earliest);

	const types = OVERVIEW_RECORD_TYPES.map(
		(type): OverviewTypeRow =>
			typeRow(type, input.rows[type], input.earliest[type], plans, seriesPeriods),
	);
	const ratios = OVERVIEW_RATIOS.map(
		(ratio): OverviewRatioRow =>
			ratioRow(ratio, input.rows[OVERVIEW_RATIO_TYPES[ratio]], plans, seriesPeriods),
	);

	return {
		grain,
		period,
		today,
		cutThrough: partial && grain !== 'day' ? today : null,
		earliest,
		columns: plans.map(toColumn),
		types,
		ratios,
	};
}

// --- the columns --------------------------------------------------------------

/**
 * The windows the columns count over. A partial period cuts every comparison
 * to the same calendar date within its own period, clamped to that period's
 * last day; a day is never cut and compares whole against whole.
 *
 * A day has no year-back columns. The same calendar date a year earlier
 * falls on another weekday, so a Monday would read against a Sunday and the
 * five-year mean would average a week's worth of different days; the chart
 * carries the year's trend instead.
 */
function columnPlans(
	grain: OverviewGrain,
	period: string,
	today: string,
	partial: boolean,
): readonly ColumnPlan[] {
	const year = overviewPeriodYear(period);
	const priorYears = Array.from(
		{ length: OVERVIEW_AVERAGE_YEARS },
		(_, index) => year - OVERVIEW_AVERAGE_YEARS + index,
	);

	switch (grain) {
		case 'day':
			return [
				{ key: 'period', window: { from: period, to: period } },
				{ key: 'previous', window: { from: addDays(period, -1), to: addDays(period, -1) } },
			];
		case 'month': {
			const month = overviewPeriodMonth(period);
			const cutDay = partial ? Number(today.slice(8, 10)) : null;
			const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
			return [
				{ key: 'period', window: monthWindow(year, month, cutDay) },
				{ key: 'previous', window: monthWindow(previous.year, previous.month, cutDay) },
				{ key: 'lastYear', window: monthWindow(year - 1, month, cutDay) },
				{
					key: 'average',
					years: priorYears.map((y) => ({ year: y, window: monthWindow(y, month, cutDay) })),
				},
			];
		}
		case 'year': {
			const cut = partial ? (parseCalendarDate(today) ?? null) : null;
			return [
				{ key: 'period', window: yearWindow(year, cut) },
				{ key: 'previous', window: yearWindow(year - 1, cut) },
				{ key: 'average', years: priorYears.map((y) => ({ year: y, window: yearWindow(y, cut) })) },
			];
		}
	}
}

function monthWindow(year: number, month: number, cutDay: number | null): Window {
	return {
		from: `${year}-${pad2(month)}-01`,
		to: clampedDay(year, month, cutDay ?? daysInMonth(year, month)),
	};
}

function yearWindow(
	year: number,
	cut: { readonly month: number; readonly day: number } | null,
): Window {
	return {
		from: `${year}-01-01`,
		to: cut === null ? `${year}-12-31` : clampedDay(year, cut.month, cut.day),
	};
}

function toColumn(plan: ColumnPlan): OverviewColumn {
	if (plan.key === 'average') {
		const years = plan.years.map((entry) => entry.year);
		return { key: 'average', years: { from: Math.min(...years), to: Math.max(...years) } };
	}
	return { key: plan.key, from: plan.window.from, to: plan.window.to };
}

// --- the rows -----------------------------------------------------------------

interface Sum {
	readonly count: number;
	readonly numerator: number;
	readonly denominator: number;
}

const NOTHING: Sum = { count: 0, numerator: 0, denominator: 0 };

function sumOver(rows: readonly OverviewDailyRow[], window: Window): Sum {
	let count = 0;
	let numerator = 0;
	let denominator = 0;
	for (const row of rows) {
		if (row.day >= window.from && row.day <= window.to) {
			count += row.count;
			numerator += row.numerator ?? 0;
			denominator += row.denominator ?? 0;
		}
	}
	return { count, numerator, denominator };
}

/**
 * A year qualifies for a type when it holds any record of that type anywhere
 * in the calendar year, so a year the Organization ran inspections and
 * recorded none in September contributes a zero September rather than
 * dropping out. The divisor is the number of qualifying years among the five.
 */
function qualifies(rows: readonly OverviewDailyRow[], year: number): boolean {
	const prefix = `${year}-`;
	return rows.some((row) => row.count > 0 && row.day.startsWith(prefix));
}

/** The pooled sum over the qualifying years of the average column, and how many qualified. */
function averageOf(
	rows: readonly OverviewDailyRow[],
	plan: Extract<ColumnPlan, { key: 'average' }>,
): { readonly sum: Sum; readonly years: number } {
	let years = 0;
	let sum = NOTHING;
	for (const entry of plan.years) {
		if (!qualifies(rows, entry.year)) {
			continue;
		}
		years += 1;
		const window = sumOver(rows, entry.window);
		sum = {
			count: sum.count + window.count,
			numerator: sum.numerator + window.numerator,
			denominator: sum.denominator + window.denominator,
		};
	}
	return { sum, years };
}

function typeRow(
	type: OverviewRecordType,
	rows: readonly OverviewDailyRow[],
	earliest: string | null,
	plans: readonly ColumnPlan[],
	seriesPeriods: readonly string[],
): OverviewTypeRow {
	let averageYears = 0;
	const values = plans.map((plan): number | null => {
		if (plan.key !== 'average') {
			return sumOver(rows, plan.window).count;
		}
		const average = averageOf(rows, plan);
		averageYears = average.years;
		return average.years === 0 ? null : average.sum.count / average.years;
	});
	const series = seriesPeriods.map(
		(period): OverviewSeriesPoint => ({ period, value: sumOver(rows, periodWindow(period)).count }),
	);
	return { type, recordedEver: earliest !== null, values, averageYears, series };
}

function ratioRow(
	ratio: OverviewRatio,
	rows: readonly OverviewDailyRow[],
	plans: readonly ColumnPlan[],
	seriesPeriods: readonly string[],
): OverviewRatioRow {
	let averageYears = 0;
	const sums = plans.map((plan): Sum => {
		if (plan.key !== 'average') {
			return sumOver(rows, plan.window);
		}
		const average = averageOf(rows, plan);
		averageYears = average.years;
		return average.sum;
	});
	const series = seriesPeriods.map((period): OverviewRatioPoint => {
		const sum = sumOver(rows, periodWindow(period));
		return { period, numerator: sum.numerator, denominator: sum.denominator };
	});
	return {
		ratio,
		numerators: sums.map((sum) => sum.numerator),
		denominators: sums.map((sum) => sum.denominator),
		averageYears,
		series,
	};
}

// --- the series ---------------------------------------------------------------

/**
 * The periods the chart plots, whole and never in the future: on `day` every
 * day of the picked day's year through today when that is the current year;
 * on `month` the twelve months of the picked month's year and the twelve of
 * the year before; on `year` every year from `earliest`'s year to the current
 * year, so the picked year sits inside it.
 */
function seriesPeriodsFor(
	grain: OverviewGrain,
	period: string,
	today: string,
	earliest: string | null,
): readonly string[] {
	const year = overviewPeriodYear(period);
	switch (grain) {
		case 'day':
			return daySeries(year, today);
		case 'month':
			return monthSeries(year, currentOverviewPeriod('month', today));
		case 'year':
			return yearSeries(year, earliest, Number(currentOverviewPeriod('year', today)));
	}
}

function daySeries(year: number, today: string): readonly string[] {
	const periods: string[] = [];
	const end = minDate(`${year}-12-31`, today);
	for (let day = `${year}-01-01`; day <= end; day = addDays(day, 1)) {
		periods.push(day);
	}
	return periods;
}

function monthSeries(year: number, currentMonth: string): readonly string[] {
	const periods: string[] = [];
	for (const y of [year - 1, year]) {
		for (let month = 1; month <= 12; month += 1) {
			const candidate = `${y}-${pad2(month)}`;
			if (candidate <= currentMonth) {
				periods.push(candidate);
			}
		}
	}
	return periods;
}

function yearSeries(year: number, earliest: string | null, currentYear: number): readonly string[] {
	const start = Math.min(year, earliest === null ? year : overviewPeriodYear(earliest));
	const periods: string[] = [];
	for (let y = start; y <= currentYear; y += 1) {
		periods.push(`${y}`);
	}
	return periods;
}

/** The whole span of a series point, whichever grain its spelling says it is. */
function periodWindow(period: string): Window {
	const grain: OverviewGrain =
		period.length === 10 ? 'day' : period.length === 7 ? 'month' : 'year';
	return overviewPeriodSpan(grain, period);
}

function leastOf(dates: readonly (string | null)[]): string | null {
	let least: string | null = null;
	for (const date of dates) {
		if (date !== null && (least === null || date < least)) {
			least = date;
		}
	}
	return least;
}
