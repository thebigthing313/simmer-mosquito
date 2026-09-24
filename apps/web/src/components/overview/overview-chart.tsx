/**
 * The one chart the period-in-review pages draw, one per shown row, on
 * `ChartContainer` over Recharts. The form is the grain's: Today plots the
 * year's days as bars, one per day with the weekends in, packed with no gap
 * because 365 slots at a 600px plot width leave no room for one; Monthly plots twelve
 * groups of two bars, the picked month's year in the period role beside the
 * year before in the comparison role; Annual plots one bar per year over
 * the whole history. Every form paints its roles through
 * the chart's own `ChartConfig` so the marks read `var(--color-period)` and
 * `check:map-palette` has no literal to refuse. `docs/today-spec.md` and
 * `docs/monthly-spec.md`, "The chart", and `docs/web-components.md` for the
 * choices.
 *
 * A ratio chart plots the ratio itself off the numerator and denominator the
 * series carries; a point whose denominator is zero is a gap, `null`, which
 * draws no bar, so a day with no inspections draws nothing rather
 * than `0%`. Clicking the plot opens the period under the pointer at the
 * page's grain, through `periodDestination`; there is no `Link` inside an
 * SVG, so the destination is asserted on that function rather than by href.
 */

import {
	type OverviewGrain,
	type OverviewRatio,
	type OverviewRatioPoint,
	type OverviewSeriesPoint,
	overviewPeriodMonth,
	overviewPeriodYear,
} from '@simmer-mosquito/domain';
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from '@simmer-mosquito/ui-web/components/ui/chart';
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';
import { formatCount } from '../../lib/format-count';
import { formatMonthDay } from '../../lib/local-date';
import {
	formatRatio,
	MONTH_LABELS,
	type MonthGroup,
	monthGroups,
	ratioValue,
} from './overview-data';

/** What one chart plots: a count series, or a ratio series with the ratio's own formatting. */
export type OverviewChartSeries =
	| { readonly kind: 'count'; readonly points: readonly OverviewSeriesPoint[] }
	| {
			readonly kind: 'ratio';
			readonly ratio: OverviewRatio;
			readonly points: readonly OverviewRatioPoint[];
	  };

/** One plotted point: the period, and the value or a gap. */
interface PlotPoint {
	readonly period: string;
	readonly value: number | null;
}

export function OverviewChart({
	grain,
	period,
	series,
	onOpenPeriod,
}: {
	readonly grain: OverviewGrain;
	/** The picked period, marked with the dashed reference line. */
	readonly period: string;
	readonly series: OverviewChartSeries;
	/** A click on the plot, with the period under the pointer. */
	readonly onOpenPeriod: (period: string) => void;
}) {
	const points = plotPoints(series);
	// Wrapped, because Recharts hands a tick formatter the tick's index as a
	// second argument and `formatCount` would read it as the fraction digits.
	const format =
		series.kind === 'ratio' ? formatRatioTick(series.ratio) : (value: number) => formatCount(value);
	const wholeNumbers = series.kind === 'count';
	if (grain === 'month') {
		return (
			<MonthsBars
				format={format}
				groups={monthGroups(points, overviewPeriodYear(period))}
				onOpenPeriod={onOpenPeriod}
				period={period}
				wholeNumbers={wholeNumbers}
			/>
		);
	}
	if (grain === 'year') {
		return (
			<YearsBars
				format={format}
				onOpenPeriod={onOpenPeriod}
				period={period}
				points={points}
				wholeNumbers={wholeNumbers}
			/>
		);
	}
	return (
		<DaysBars
			format={format}
			onOpenPeriod={onOpenPeriod}
			period={period}
			points={points}
			wholeNumbers={wholeNumbers}
		/>
	);
}

function plotPoints(series: OverviewChartSeries): readonly PlotPoint[] {
	if (series.kind === 'count') {
		return series.points;
	}
	return series.points.map((point) => ({
		period: point.period,
		value: ratioValue(point.numerator, point.denominator),
	}));
}

function formatRatioTick(ratio: OverviewRatio): (value: number) => string {
	return (value) => formatRatio(ratio, value);
}

/** The period role, named so the marks read `var(--color-period)`. */
const PERIOD_CONFIG = {
	period: { label: 'Period', color: 'var(--chart-period)' },
} satisfies ChartConfig;

/** Both roles, labelled with their years so the tooltip names the series. */
function pairConfig(year: number): ChartConfig {
	return {
		period: { label: `${year}`, color: 'var(--chart-period)' },
		comparison: { label: `${year - 1}`, color: 'var(--chart-comparison)' },
	};
}

/** The mark spec for a bar: a 4px radius on the data end and a square baseline. */
const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];

/** The chart's own padding, because `Panel`'s body has none. */
const CHART_FRAME = 'px-3 pt-3 pb-2';

/** The plot height, the same on every panel so the grid lines up. */
const PLOT = 'h-52 w-full';

/** What Recharts hands a click on a cartesian chart: the label under the pointer, when there is one. */
interface PlotClick {
	readonly activeLabel?: string | number | undefined;
}

// --- Today: the year's days ---------------------------------------------------

/**
 * One bar per day of the year so far, weekends included, so a quiet weekend
 * reads as two short bars rather than a line drawn across it. The bars touch:
 * at this density a gap would be wider than the bar. No corner radius either,
 * since a bar two pixels wide has no corner to round. A ratio day whose
 * denominator is zero is `null` and draws no bar.
 */
function DaysBars({
	points,
	period,
	format,
	wholeNumbers,
	onOpenPeriod,
}: {
	readonly points: readonly PlotPoint[];
	readonly period: string;
	readonly format: (value: number) => string;
	/** A count axis ticks at whole numbers; a ratio axis may not. */
	readonly wholeNumbers: boolean;
	readonly onOpenPeriod: (period: string) => void;
}) {
	return (
		<div className={CHART_FRAME}>
			<ChartContainer className={PLOT} config={PERIOD_CONFIG}>
				<BarChart
					barCategoryGap={0}
					className="cursor-pointer"
					data={points as PlotPoint[]}
					margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
					onClick={(state: PlotClick) => {
						if (typeof state.activeLabel === 'string') {
							onOpenPeriod(state.activeLabel);
						}
					}}
				>
					<CartesianGrid stroke="var(--border)" strokeOpacity={0.6} vertical={false} />
					<XAxis
						axisLine={false}
						dataKey="period"
						interval={0}
						tickFormatter={monthTick}
						tickLine={false}
						tickMargin={6}
						ticks={monthStarts(points)}
					/>
					<YAxis
						allowDecimals={!wholeNumbers}
						axisLine={false}
						tickFormatter={format}
						tickLine={false}
						width={44}
					/>
					<ChartTooltip
						content={
							<ChartTooltipContent
								formatter={tooltipRow(format)}
								labelFormatter={(label) => formatMonthDay(String(label))}
							/>
						}
						cursor={{ fill: 'var(--muted)', fillOpacity: 0.6 }}
					/>
					<Bar dataKey="value" fill="var(--color-period)" isAnimationActive={false} name="period" />
					<ReferenceLine
						stroke="var(--foreground)"
						strokeDasharray="3 3"
						strokeOpacity={0.7}
						x={period}
					/>
				</BarChart>
			</ChartContainer>
		</div>
	);
}

/** The first day of each month the series holds: one tick per month along the axis. */
function monthStarts(points: readonly PlotPoint[]): string[] {
	return points.map((point) => point.period).filter((period) => period.endsWith('-01'));
}

/** The month a day's tick names. */
function monthTick(period: string): string {
	return MONTH_LABELS[overviewPeriodMonth(period) - 1] ?? '';
}

// --- Monthly: twelve months beside last year ---------------------------------

/**
 * A grouped bar: twelve groups of two, the period series left of the
 * comparison series the way the legend reads them, `maxBarSize` 24, `barGap`
 * 2, no stroke, the picked month marked with the dashed line at its group. A
 * bar opens its own month, so a comparison bar opens the year before's.
 */
function MonthsBars({
	groups,
	period,
	format,
	wholeNumbers,
	onOpenPeriod,
}: {
	readonly groups: readonly MonthGroup[];
	readonly period: string;
	readonly format: (value: number) => string;
	readonly wholeNumbers: boolean;
	readonly onOpenPeriod: (period: string) => void;
}) {
	const year = overviewPeriodYear(period);
	const picked = groups.find((group) => group.periodMonth === period);
	// Recharts hands a bar click the drawn rectangle and its index; the group
	// is read back by that index rather than off the rectangle's payload.
	const open = (which: 'periodMonth' | 'comparisonMonth') => (_item: unknown, index: number) => {
		const month = groups[index]?.[which];
		if (month !== undefined) {
			onOpenPeriod(month);
		}
	};
	return (
		<div className={CHART_FRAME}>
			<ChartContainer className={PLOT} config={pairConfig(year)}>
				<BarChart
					barCategoryGap="28%"
					barGap={2}
					data={groups as MonthGroup[]}
					margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
				>
					<CartesianGrid stroke="var(--border)" strokeOpacity={0.6} vertical={false} />
					<XAxis axisLine={false} dataKey="label" tickLine={false} tickMargin={6} />
					<YAxis
						allowDecimals={!wholeNumbers}
						axisLine={false}
						tickFormatter={format}
						tickLine={false}
						width={44}
					/>
					<ChartTooltip
						content={<ChartTooltipContent formatter={tooltipPair(format, year)} />}
						cursor={{ fill: 'var(--muted)', fillOpacity: 0.6 }}
					/>
					<Bar
						className="cursor-pointer"
						dataKey="period"
						fill="var(--color-period)"
						isAnimationActive={false}
						maxBarSize={24}
						name="period"
						onClick={open('periodMonth')}
						radius={BAR_RADIUS}
					/>
					<Bar
						className="cursor-pointer"
						dataKey="comparison"
						fill="var(--color-comparison)"
						isAnimationActive={false}
						maxBarSize={24}
						name="comparison"
						onClick={open('comparisonMonth')}
						radius={BAR_RADIUS}
					/>
					{picked === undefined ? null : (
						<ReferenceLine
							stroke="var(--foreground)"
							strokeDasharray="3 3"
							strokeOpacity={0.7}
							x={picked.label}
						/>
					)}
				</BarChart>
			</ChartContainer>
		</div>
	);
}

// --- Annual: the years ---------------------------------------------------------

/**
 * A single-series bar over every year from `earliest`'s to the current one,
 * the picked year marked with the dashed line when the series holds it, the
 * year per x tick thinned by Recharts as the width demands. A bar opens its
 * own year.
 */
function YearsBars({
	points,
	period,
	format,
	wholeNumbers,
	onOpenPeriod,
}: {
	readonly points: readonly PlotPoint[];
	readonly period: string;
	readonly format: (value: number) => string;
	readonly wholeNumbers: boolean;
	readonly onOpenPeriod: (period: string) => void;
}) {
	return (
		<div className={CHART_FRAME}>
			<ChartContainer className={PLOT} config={PERIOD_CONFIG}>
				<BarChart
					barCategoryGap="25%"
					data={points as PlotPoint[]}
					margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
				>
					<CartesianGrid stroke="var(--border)" strokeOpacity={0.6} vertical={false} />
					<XAxis
						axisLine={false}
						dataKey="period"
						interval="preserveStartEnd"
						minTickGap={24}
						tickLine={false}
						tickMargin={6}
					/>
					<YAxis
						allowDecimals={!wholeNumbers}
						axisLine={false}
						tickFormatter={format}
						tickLine={false}
						width={44}
					/>
					<ChartTooltip
						content={<ChartTooltipContent formatter={tooltipRow(format)} />}
						cursor={{ fill: 'var(--muted)', fillOpacity: 0.6 }}
					/>
					<Bar
						className="cursor-pointer"
						dataKey="value"
						fill="var(--color-period)"
						isAnimationActive={false}
						maxBarSize={24}
						name="period"
						onClick={(_item: unknown, index: number) => {
							const year = points[index]?.period;
							if (year !== undefined) {
								onOpenPeriod(year);
							}
						}}
						radius={BAR_RADIUS}
					/>
					{points.some((point) => point.period === period) ? (
						<ReferenceLine
							stroke="var(--foreground)"
							strokeDasharray="3 3"
							strokeOpacity={0.7}
							x={period}
						/>
					) : null}
				</BarChart>
			</ChartContainer>
		</div>
	);
}

/**
 * A tooltip row for one of two series: the value first, then the series'
 * year, so the hovered month reads both years at a glance.
 */
function tooltipPair(format: (value: number) => string, year: number) {
	return (value: unknown, name: unknown) => (
		<span className="flex w-full items-center justify-between gap-3">
			<span className="font-medium text-foreground tabular-nums">
				{typeof value === 'number' ? format(value) : String(value)}
			</span>
			<span className="text-muted-foreground">{name === 'period' ? year : year - 1}</span>
		</span>
	);
}

/**
 * The tooltip's one row, value first through the pinned formatter, because
 * `ChartTooltipContent`'s default calls `toLocaleString()` unpinned.
 */
function tooltipRow(format: (value: number) => string) {
	return (value: unknown) => (
		<span className="font-medium text-foreground tabular-nums">
			{typeof value === 'number' ? format(value) : String(value)}
		</span>
	);
}
