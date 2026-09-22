/**
 * The one chart the period-in-review pages draw, one per shown row, on
 * `ChartContainer` over Recharts. The form is the grain's: Today plots the
 * year's days as an area, because 365 slots at a 600px plot width leave no
 * bar the mark spec's 2px gap or 24px hit target. Every form paints the
 * period role, `--chart-period`, through the chart's own `ChartConfig` so the
 * marks read `var(--color-period)` and `check:map-palette` has no literal to
 * refuse. `docs/today-spec.md`, "The charts", and `docs/web-components.md`
 * for the choices.
 *
 * A ratio chart plots the ratio itself off the numerator and denominator the
 * series carries; a point whose denominator is zero is a gap, `null` with
 * `connectNulls` off, so a day with no inspections draws nothing rather
 * than `0%`. Clicking the plot opens the period under the pointer at the
 * page's grain, through `periodDestination`; there is no `Link` inside an
 * SVG, so the destination is asserted on that function rather than by href.
 */

import type {
	OverviewRatio,
	OverviewRatioPoint,
	OverviewSeriesPoint,
} from '@simmer-mosquito/domain';
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from '@simmer-mosquito/ui-web/components/ui/chart';
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';
import { formatCount } from '../../lib/format-count';
import { formatMonthDay } from '../../lib/local-date';
import { formatRatio, ratioValue } from './overview-data';

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
	period,
	series,
	onOpenPeriod,
}: {
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
	return (
		<DaysArea
			format={format}
			onOpenPeriod={onOpenPeriod}
			period={period}
			points={points}
			wholeNumbers={series.kind === 'count'}
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

/** The chart's own padding, because `Panel`'s body has none. */
const CHART_FRAME = 'px-3 pt-3 pb-2';

/** The plot height, the same on every panel so the grid lines up. */
const PLOT = 'h-52 w-full';

/** What Recharts hands a click on a cartesian chart: the label under the pointer, when there is one. */
interface PlotClick {
	readonly activeLabel?: string | number | undefined;
}

// --- Today: the year's days ---------------------------------------------------

function DaysArea({
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
				<AreaChart
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
						interval="preserveStartEnd"
						minTickGap={40}
						tickFormatter={monthTick}
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
						content={
							<ChartTooltipContent
								formatter={tooltipRow(format)}
								labelFormatter={(label) => formatMonthDay(String(label))}
							/>
						}
						cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
					/>
					<Area
						connectNulls={false}
						dataKey="value"
						fill="var(--color-period)"
						fillOpacity={0.1}
						isAnimationActive={false}
						name="period"
						stroke="var(--color-period)"
						strokeWidth={2}
						type="monotone"
					/>
					<ReferenceLine
						stroke="var(--foreground)"
						strokeDasharray="3 3"
						strokeOpacity={0.7}
						x={period}
					/>
				</AreaChart>
			</ChartContainer>
		</div>
	);
}

/** The month a day's tick names, once per month along the axis. */
function monthTick(period: string): string {
	return new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(
		new Date(`${period}T00:00:00Z`),
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
