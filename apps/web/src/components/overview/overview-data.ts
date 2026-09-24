/**
 * What the period-in-review pages draw off `GET /overview/:grain`, and
 * nothing that reads a clock or a store: the words for each row and column,
 * where a count links, where a bar click goes, and the ratio arithmetic.
 * `docs/today-spec.md` is the brief; the wire types are the domain's.
 */

import {
	addDays,
	OVERVIEW_PERIOD_LENGTH,
	OVERVIEW_PERIOD_PARAM,
	type OverviewColumn,
	type OverviewGrain,
	type OverviewRatio,
	type OverviewRecordType,
	type OverviewResponse,
	type OverviewTypeRow,
	overviewPeriodMonth,
	overviewPeriodSpan,
	overviewPeriodYear,
	pad2,
} from '@simmer-mosquito/domain';
import type { LinkProps } from '@tanstack/react-router';
import { formatCount } from '../../lib/format-count';
import {
	formatListDate,
	formatLongDate,
	formatMonthDay,
	formatMonthYear,
} from '../../lib/local-date';
import { recordNoun } from '../../lib/record-nouns';
import type { SearchCodec } from '../../lib/search-filters';

/** The page each grain is drawn on. */
export const OVERVIEW_ROUTES = {
	day: '/today',
	month: '/monthly',
	year: '/annual',
} as const satisfies Record<OverviewGrain, string>;

export const OVERVIEW_TITLES: Readonly<Record<OverviewGrain, string>> = {
	day: 'Today',
	month: 'Monthly',
	year: 'Annual',
};

export const OVERVIEW_DESCRIPTIONS: Readonly<Record<OverviewGrain, string>> = {
	day: 'What was recorded on one day, against the day before, with the year so far under it.',
	month:
		'What was recorded in one month, against the month before, the same month last year and the five years before.',
	year: 'What was recorded in one year, against the year before and the five years before.',
};

/**
 * The period's search codec, of `dateParam`'s shape: a regex over the value,
 * anything else reads as no value, so `/today?date=` matches the Activity
 * Monitor link the Dashboard already writes. Whether the value is a real
 * period on or before today is the page's question, not the codec's,
 * because the answer needs the Organization's today.
 */
export function periodSearchCodec(grain: OverviewGrain): SearchCodec<string> {
	const shape = PERIOD_SHAPE[grain];
	return {
		decode: (raw) => {
			const value = periodParamText(raw);
			return value !== undefined && shape.test(value) ? value : undefined;
		},
		encode: (value) => (shape.test(value) ? periodParamValue(grain, value) : undefined),
	};
}

/**
 * A period as it arrives off the URL. The router's search serializer writes
 * a string that reads as a number back as one, so `?year=2026` parses to the
 * number 2026, while `?date=2026-09-15` stays a string.
 */
export function periodParamText(raw: unknown): string | undefined {
	if (typeof raw === 'string') {
		return raw;
	}
	return typeof raw === 'number' && Number.isInteger(raw) ? `${raw}` : undefined;
}

/**
 * A period as the URL carries it: a year goes as a number, because the same
 * serializer would otherwise write the string `2026` as `%222026%22`.
 */
function periodParamValue(grain: OverviewGrain, period: string): string | number {
	return grain === 'year' ? Number(period) : period;
}

const PERIOD_SHAPE: Readonly<Record<OverviewGrain, RegExp>> = {
	day: /^\d{4}-\d{2}-\d{2}$/,
	month: /^\d{4}-\d{2}$/,
	year: /^\d{4}$/,
};

/**
 * Where a period opens: its own page with the period written explicitly,
 * which is what a bar click and an upward link both write. An explicit param
 * naming the current period is legal and never rewritten, so nothing here
 * special-cases it.
 */
export function periodDestination(
	grain: OverviewGrain,
	period: string,
): {
	readonly to: (typeof OVERVIEW_ROUTES)[OverviewGrain];
	readonly search: Record<string, string | number>;
} {
	return {
		to: OVERVIEW_ROUTES[grain],
		search: { [OVERVIEW_PERIOD_PARAM[grain]]: periodParamValue(grain, period) },
	};
}

/** What each row is called, read off the record-nouns register the way the Dashboard strip reads it. */
export const OVERVIEW_LABELS: Readonly<Record<OverviewRecordType, string>> = {
	inspections: recordNoun('inspection').titleMany,
	samples: recordNoun('sample').titleMany,
	collections: recordNoun('collection').titleMany,
	applications: recordNoun('application').titleMany,
	sourceReductions: recordNoun('sourceReduction').titleMany,
	releases: recordNoun('biocontrolAction').titleMany,
	serviceRequests: `${recordNoun('serviceRequest').titleMany} received`,
	outreachActions: recordNoun('outreachAction').titleMany,
};

export const OVERVIEW_RATIO_LABELS: Readonly<Record<OverviewRatio, string>> = {
	positiveInspections: 'Positive inspections',
	mosquitoesPerCollection: 'Mosquitoes per collection',
};

/**
 * The explorer a count opens, with `from` and `to` at the period's first and
 * last day. The count is every request received, so the service requests
 * link writes `status=all` beside the dates, which is also that explorer's
 * default and stays off the address bar.
 */
function explorerLink(
	type: OverviewRecordType,
	span: { readonly from: string; readonly to: string },
): LinkProps {
	switch (type) {
		case 'inspections':
			return { to: '/larval-surveillance/inspections', search: span };
		case 'samples':
			return { to: '/larval-surveillance/samples', search: span };
		case 'collections':
			return { to: '/adult-surveillance/collections', search: span };
		case 'applications':
			return { to: '/control-operations/chemical', search: span };
		case 'sourceReductions':
			return { to: '/control-operations/source-reduction', search: span };
		case 'releases':
			return { to: '/control-operations/biocontrol', search: span };
		case 'serviceRequests':
			return { to: '/public-engagement/service-requests', search: { status: 'all', ...span } };
		case 'outreachActions':
			return { to: '/public-engagement/outreach', search: span };
	}
}

/** The count link for a real column: the column's period, whole. */
export function columnLink(
	grain: OverviewGrain,
	type: OverviewRecordType,
	column: OverviewColumn,
): LinkProps | null {
	if (column.key === 'average') {
		return null;
	}
	return explorerLink(type, overviewPeriodSpan(grain, columnPeriod(grain, column)));
}

/** A real column's period at the page's grain, read off the column's first day. */
function columnPeriod(
	grain: OverviewGrain,
	column: Extract<OverviewColumn, { key: 'period' | 'previous' | 'lastYear' }>,
): string {
	return column.from.slice(0, OVERVIEW_PERIOD_LENGTH[grain]);
}

/** `Sep 21, 2026`, `Sep 2026` or `2026`: the table panel's title. */
export function periodTitle(grain: OverviewGrain, period: string): string {
	switch (grain) {
		case 'day':
			return formatListDate(period);
		case 'month':
			return formatMonthYear(period, 'short');
		case 'year':
			return period;
	}
}

/** `Monday, September 21, 2026`, `September 2026` or `2026`: the upward line's own name. */
export function periodLongName(grain: OverviewGrain, period: string): string {
	switch (grain) {
		case 'day':
			return formatLongDate(period);
		case 'month':
			return formatMonthYear(period);
		case 'year':
			return period;
	}
}

/** A column's header, off the response: the period's plain name, or the averaged years. */
export function columnHeader(grain: OverviewGrain, column: OverviewColumn): string {
	if (column.key === 'average') {
		return `${column.years.from}–${column.years.to} average`;
	}
	return periodTitle(grain, columnPeriod(grain, column));
}

/**
 * The caption in the table panel's `actions` slot when the period is
 * partial, and nothing when it is complete, so its absence is the signal
 * that the comparison is whole. Today never draws one.
 */
export function cutCaption(grain: OverviewGrain, cutThrough: string | null): string | null {
	if (cutThrough === null || grain === 'day') {
		return null;
	}
	if (grain === 'month') {
		return `Each period through the ${ordinal(Number(cutThrough.slice(8, 10)))}`;
	}
	return `Each period through ${formatMonthDay(cutThrough)}`;
}

function ordinal(day: number): string {
	const tens = day % 100;
	if (tens >= 11 && tens <= 13) {
		return `${day}th`;
	}
	const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th';
	return `${day}${suffix}`;
}

/** `2026 by day`, `2026 by month, beside 2025` or `By year`: the trend section's heading. */
export function trendHeading(grain: OverviewGrain, period: string): string {
	const year = period.slice(0, 4);
	switch (grain) {
		case 'day':
			return `${year} by day`;
		case 'month':
			return `${year} by month, beside ${Number(year) - 1}`;
		case 'year':
			return 'By year';
	}
}

/** The rows the page draws: a type the Organization has never recorded is not a row. */
export function shownTypes(response: OverviewResponse): readonly OverviewTypeRow[] {
	return response.types.filter((row) => row.recordedEver);
}

/** A share or a rate, or null over a zero denominator, which draws the absence glyph. */
export function ratioValue(numerator: number, denominator: number): number | null {
	return denominator === 0 ? null : numerator / denominator;
}

/** `34%` for a share and `12.4` for a rate. */
export function formatRatio(ratio: OverviewRatio, value: number): string {
	return ratio === 'positiveInspections' ? `${Math.round(value * 100)}%` : formatCount(value, 1);
}

/**
 * A count cell, rounded to a whole number. A five-year average of a count is
 * still a count of records, and `4,671.7 inspections` claims a precision the
 * comparison does not have.
 */
export function formatCell(value: number): string {
	return formatCount(Math.round(value));
}

/**
 * One group of Monthly's grouped bar: a calendar month with the picked
 * month's year in the period role and the year before in the comparison
 * role. A month the year has not reached is `undefined`, which is no bar; a
 * ratio over a zero denominator is `null`, which is no bar either.
 */
export interface MonthGroup {
	/** `Jan` to `Dec`. */
	readonly label: string;
	/** The two months the bars open, `YYYY-MM`, present when that year reached the month. */
	readonly periodMonth: string | undefined;
	readonly comparisonMonth: string | undefined;
	readonly period: number | null | undefined;
	readonly comparison: number | null | undefined;
}

/**
 * The response's flat 24-point month series split by the year in each
 * point's `period` into twelve groups, the picked month's year beside the
 * year before. Points outside those two years are ignored.
 */
export function monthGroups(
	points: readonly { readonly period: string; readonly value: number | null }[],
	year: number,
): readonly MonthGroup[] {
	const byMonth = new Map(points.map((point) => [point.period, point.value]));
	return Array.from({ length: 12 }, (_, index) => {
		const month = `${index + 1}`.padStart(2, '0');
		const periodMonth = `${year}-${month}`;
		const comparisonMonth = `${year - 1}-${month}`;
		return {
			label: MONTH_LABELS[index] ?? '',
			periodMonth: byMonth.has(periodMonth) ? periodMonth : undefined,
			comparisonMonth: byMonth.has(comparisonMonth) ? comparisonMonth : undefined,
			period: byMonth.get(periodMonth),
			comparison: byMonth.get(comparisonMonth),
		};
	});
}

/** The three-letter month, `Jan` to `Dec`, indexed from zero, `en-US`. */
export const MONTH_LABELS: readonly string[] = Array.from({ length: 12 }, (_, index) =>
	new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(
		new Date(Date.UTC(2026, index, 1)),
	),
);

/** The period one step either side of `period` at its grain. */
export function stepPeriod(grain: OverviewGrain, period: string, by: -1 | 1): string {
	switch (grain) {
		case 'day':
			return addDays(period, by);
		case 'month': {
			const stepped = new Date(
				Date.UTC(overviewPeriodYear(period), overviewPeriodMonth(period) - 1 + by, 1),
			);
			return `${stepped.getUTCFullYear()}-${pad2(stepped.getUTCMonth() + 1)}`;
		}
		case 'year':
			return `${Number(period) + by}`;
	}
}

/** One year's worth of the month select, newest month first. */
export interface MonthGroupOfYear {
	readonly year: number;
	readonly months: readonly string[];
}

/**
 * The months from the current one back to `earliest`'s, newest first and
 * grouped by year. Before the response says where the history starts, the
 * list is the current year alone.
 */
export function reachableMonths(
	current: string,
	earliest: string | null,
): readonly MonthGroupOfYear[] {
	const first = earliest ?? `${overviewPeriodYear(current)}-01`;
	const years: { year: number; months: string[] }[] = [];
	for (let month = current; month >= first; month = stepPeriod('month', month, -1)) {
		const year = overviewPeriodYear(month);
		const group = years.at(-1);
		if (group !== undefined && group.year === year) {
			group.months.push(month);
		} else {
			years.push({ year, months: [month] });
		}
	}
	return years;
}

/**
 * The years from the current one back to `earliest`'s, newest first. Before
 * the response says where the history starts, the list is the current year
 * alone.
 */
export function reachableYears(current: string, earliest: string | null): readonly string[] {
	const first = Number(earliest ?? current);
	const years: string[] = [];
	for (let year = Number(current); year >= first; year -= 1) {
		years.push(`${year}`);
	}
	return years;
}
