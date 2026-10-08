/**
 * The one chart the period-in-review pages draw, one per shown row, on
 * `ChartContainer` over Recharts. The form is the grain's: Today plots the
 * year's days as bars, one per day with the weekends in, packed with no gap
 * because 365 slots at a 600px plot width leave no room for one; Monthly plots twelve
 * groups of three bars, the picked month's year in the period role beside the
 * year before in the comparison role and the five-year average in the average
 * role; Annual plots one bar per year over at most ten years, with the
 * five years before the picked year averaged as a dashed horizontal line.
 * Every form paints its roles through
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
 *
 * `height` is the caller's: `panel` is the fixed plot every trend panel draws
 * at, and `fill` takes whatever height the parent gives it, which is what the
 * zoom overlay passes.
 */

import {
	type OverviewGrain,
	type OverviewRatio,
	type OverviewRatioPoint,
	type OverviewRatioSum,
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
	averageLabel,
	averageValues,
	formatRatio,
	MONTH_LABELS,
	type MonthGroup,
	monthGroups,
	ratioValue,
} from './overview-data';

/**
 * What one chart plots: a count series, or a ratio series with the ratio's
 * own formatting, each with the response's `seriesAverage` beside it.
 */
export type OverviewChartSeries =
	| {
			readonly kind: 'count';
			readonly points: readonly OverviewSeriesPoint[];
			readonly average: readonly (number | null)[];
	  }
	| {
			readonly kind: 'ratio';
			readonly ratio: OverviewRatio;
			readonly points: readonly OverviewRatioPoint[];
			readonly average: readonly OverviewRatioSum[];
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
	height = 'panel',
}: {
	readonly grain: OverviewGrain;
	/** The picked period, marked with the dashed reference line. */
	readonly period: string;
	readonly series: OverviewChartSeries;
	/** A click on the plot, with the period under the pointer. */
	readonly onOpenPeriod: (period: string) => void;
	/** The fixed panel plot, or the parent's whole height. */
	readonly height?: OverviewChartHeight;
}) {
	const points = plotPoints(series);
	const average = averageValues(series);
	// Wrapped, because Recharts hands a tick formatter the tick's index as a
	// second argument and `formatCount` would read it as the fraction digits.
	const format =
		series.kind === 'ratio' ? formatRatioTick(series.ratio) : (value: number) => formatCount(value);
	const wholeNumbers = series.kind === 'count';
	if (grain === 'month') {
		return (
			<MonthsBars
				format={format}
				groups={monthGroups(points, average, overviewPeriodYear(period))}
				height={height}
				onOpenPeriod={onOpenPeriod}
				period={period}
				wholeNumbers={wholeNumbers}
			/>
		);
	}
	if (grain === 'year') {
		return (
			<YearsBars
				average={average[0] ?? null}
				format={format}
				height={height}
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
			height={height}
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

/** Monthly's three roles, labelled with their years so the tooltip names the series. */
function monthsConfig(year: number): ChartConfig {
	return {
		period: { label: `${year}`, color: 'var(--chart-period)' },
		comparison: { label: `${year - 1}`, color: 'var(--chart-comparison)' },
		average: { label: averageLabel(year), color: 'var(--chart-average)' },
	};
}

/** The mark spec for a bar: a 4px radius on the data end and a square baseline. */
const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];

/** Where the plot's height comes from: the panel's fixed one, or the parent's. */
export type OverviewChartHeight = 'panel' | 'fill';

/** The chart's own padding, because `Panel`'s body has none. */
const CHART_FRAME: Record<OverviewChartHeight, string> = {
	panel: 'px-3 pt-3 pb-2',
	fill: 'h-full px-3 pt-3 pb-2',
};

/**
 * The plot. A panel's is the same height on every panel so the grid lines up;
 * a filling one drops `ChartContainer`'s aspect ratio and draws its ticks a
 * size up, since it is read from further back.
 */
const PLOT: Record<OverviewChartHeight, string> = {
	panel: 'h-52 w-full',
	fill: 'aspect-auto h-full w-full text-sm',
};

/**
 * The value axis is as wide as its widest tick label. Recharts measures the
 * drawn ticks after layout and widens or narrows the axis to fit, so `38,000`
 * at the overlay's `text-sm` is not clipped and a `36` does not leave a gutter.
 * A fixed 44px clipped every label of five characters or more (#1324).
 */
const Y_AXIS_WIDTH = 'auto';

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
	height,
}: {
	readonly points: readonly PlotPoint[];
	readonly period: string;
	readonly format: (value: number) => string;
	/** A count axis ticks at whole numbers; a ratio axis may not. */
	readonly wholeNumbers: boolean;
	readonly onOpenPeriod: (period: string) => void;
	readonly height: OverviewChartHeight;
}) {
	return (
		<div className={CHART_FRAME[height]}>
			<ChartContainer className={PLOT[height]} config={PERIOD_CONFIG}>
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
						width={Y_AXIS_WIDTH}
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

// --- Monthly: twelve months beside last year and the average ----------------

/**
 * A grouped bar: twelve groups of three, the period series, the comparison
 * series and the average in the order the legend reads them, `maxBarSize`
 * 24, `barGap` 2, no stroke, the picked month marked with the dashed line at
 * its group. A year's bar opens its own month, so a comparison bar opens the
 * year before's; an average bar opens nothing, since no single month is
 * behind it.
 */
function MonthsBars({
	groups,
	period,
	format,
	wholeNumbers,
	onOpenPeriod,
	height,
}: {
	readonly groups: readonly MonthGroup[];
	readonly period: string;
	readonly format: (value: number) => string;
	readonly wholeNumbers: boolean;
	readonly onOpenPeriod: (period: string) => void;
	readonly height: OverviewChartHeight;
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
		<div className={CHART_FRAME[height]}>
			<ChartContainer className={PLOT[height]} config={monthsConfig(year)}>
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
						width={Y_AXIS_WIDTH}
					/>
					<ChartTooltip
						content={<ChartTooltipContent formatter={tooltipSeries(format, monthsConfig(year))} />}
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
					<Bar
						dataKey="average"
						fill="var(--color-average)"
						isAnimationActive={false}
						maxBarSize={24}
						name="average"
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
 * A single-series bar over the years the response's series carries, at most
 * `OVERVIEW_TREND_YEARS` and always holding the picked year, which the dashed
 * line marks, the year per x tick thinned by Recharts as the width demands. A bar opens its
 * own year. The average of the five years before the picked year is a dashed
 * horizontal line in the average role, absent when no year qualifies, and
 * the value axis stretches to hold it when it sits above every bar.
 */
function YearsBars({
	points,
	average,
	period,
	format,
	wholeNumbers,
	onOpenPeriod,
	height,
}: {
	readonly points: readonly PlotPoint[];
	/** The five-year average, or null when no year qualifies. */
	readonly average: number | null;
	readonly period: string;
	readonly format: (value: number) => string;
	readonly wholeNumbers: boolean;
	readonly onOpenPeriod: (period: string) => void;
	readonly height: OverviewChartHeight;
}) {
	return (
		<div className={CHART_FRAME[height]}>
			<ChartContainer className={PLOT[height]} config={PERIOD_CONFIG}>
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
						width={Y_AXIS_WIDTH}
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
					{average === null ? null : (
						<ReferenceLine
							ifOverflow="extendDomain"
							stroke="var(--chart-average)"
							strokeDasharray="6 4"
							strokeWidth={2}
							y={average}
						/>
					)}
				</BarChart>
			</ChartContainer>
		</div>
	);
}

/**
 * A tooltip row for one of Monthly's three series: the value first, then the
 * series' label off the chart's config, so the hovered month reads all three
 * at a glance.
 */
function tooltipSeries(format: (value: number) => string, config: ChartConfig) {
	return (value: unknown, name: unknown) => (
		<span className="flex w-full items-center justify-between gap-3">
			<span className="font-medium text-foreground tabular-nums">
				{typeof value === 'number' ? format(value) : String(value)}
			</span>
			<span className="text-muted-foreground">{config[String(name)]?.label ?? String(name)}</span>
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
