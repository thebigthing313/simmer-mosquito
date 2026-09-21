/**
 * PROTOTYPE. The three chart forms a period-in-review page draws, on the
 * `chart.tsx` wrapper over Recharts (#1200's findings). Today is an area over
 * the year's days, Monthly a grouped bar of twelve months beside last year,
 * Annual a single-series bar over the years. `mark` and `comparison` are the
 * two open questions #1200 handed here, switchable from the prototype bar.
 */

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from '@simmer-mosquito/ui-web/components/ui/chart';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	ReferenceDot,
	ReferenceLine,
	XAxis,
	YAxis,
} from 'recharts';
import { formatCount } from '../../lib/format-count';
import type { DayPoint, MonthPoint, YearPoint } from './prototype-data';

/** How the current bar is marked: a stronger step of the hue, or a reference line. */
export type MarkStyle = 'cell' | 'line';
/** The comparison series' step of the green ramp. */
export type ComparisonStep = 'green300' | 'green200' | 'green100';

export interface ChartOptions {
	readonly mark: MarkStyle;
	readonly comparison: ComparisonStep;
	/** Sparkline size, no axes: the ledger variant's chart column. */
	readonly compact?: boolean;
	readonly format?: ((value: number) => string) | undefined;
}

const PERIOD = 'var(--simmer-green-600)';
const PERIOD_STEP_DOWN = 'var(--simmer-green-400)';
const MARK_STROKE = 'var(--foreground)';

function comparisonColor(step: ComparisonStep): string {
	return `var(--simmer-${step.replace('green', 'green-')})`;
}

function config(options: ChartOptions, periodLabel: string, comparisonLabel?: string): ChartConfig {
	return {
		period: { label: periodLabel, color: PERIOD },
		...(comparisonLabel === undefined
			? {}
			: { comparison: { label: comparisonLabel, color: comparisonColor(options.comparison) } }),
	};
}

const FULL_HEIGHT = 'h-52';
const COMPACT_HEIGHT = 'h-12';

function height(options: ChartOptions) {
	return options.compact ? COMPACT_HEIGHT : FULL_HEIGHT;
}

function tooltipFormatter(format: (value: number) => string) {
	return (value: unknown, name: unknown) => (
		<div className="flex w-full items-center justify-between gap-3">
			<span className="text-muted-foreground">{String(name)}</span>
			<span className="font-medium text-foreground tabular-nums">
				{typeof value === 'number' ? format(value) : String(value)}
			</span>
		</div>
	);
}

// --- Today: the year's days ---------------------------------------------------

export function DaysArea({
	points,
	label,
	options,
	onPointClick,
}: {
	readonly points: readonly DayPoint[];
	readonly label: string;
	readonly options: ChartOptions;
	readonly onPointClick?: (point: DayPoint) => void;
}) {
	const format = options.format ?? formatCount;
	const current = points.find((p) => p.isCurrent);
	const compact = options.compact === true;
	return (
		<ChartContainer className={cn('w-full', height(options))} config={config(options, label)}>
			<AreaChart
				className={onPointClick ? 'cursor-pointer' : ''}
				data={points}
				onClick={(state) => {
					const point = (state as { activePayload?: { payload?: DayPoint }[] })?.activePayload?.[0]
						?.payload;
					if (onPointClick && point) onPointClick(point);
				}}
				margin={
					compact
						? { top: 4, right: 6, bottom: 2, left: 6 }
						: { top: 8, right: 12, bottom: 0, left: 0 }
				}
			>
				{compact ? null : (
					<CartesianGrid stroke="var(--border)" strokeOpacity={0.6} vertical={false} />
				)}
				<XAxis
					axisLine={false}
					dataKey="label"
					hide={compact}
					interval="preserveStartEnd"
					minTickGap={40}
					tickLine={false}
					tickMargin={6}
				/>
				<YAxis
					axisLine={false}
					hide={compact}
					tickFormatter={(v: number) => format(v)}
					tickLine={false}
					width={44}
				/>
				<ChartTooltip
					content={
						<ChartTooltipContent
							formatter={tooltipFormatter(format)}
							labelFormatter={(_v, payload) => String(payload?.[0]?.payload?.label ?? '')}
						/>
					}
					cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
				/>
				<Area
					dataKey="value"
					fill="var(--color-period)"
					fillOpacity={0.12}
					isAnimationActive={false}
					name="period"
					stroke="var(--color-period)"
					strokeWidth={compact ? 1.5 : 2}
					type="monotone"
				/>
				{current === undefined ? null : (
					<ReferenceDot
						fill="var(--color-period)"
						r={compact ? 3 : 5}
						stroke="var(--card)"
						strokeWidth={2}
						x={current.label}
						y={current.value}
					/>
				)}
			</AreaChart>
		</ChartContainer>
	);
}

// --- Monthly: twelve months beside last year ---------------------------------

export function MonthsBars({
	points,
	periodLabel,
	comparisonLabel,
	options,
	onBarClick,
}: {
	readonly points: readonly MonthPoint[];
	readonly periodLabel: string;
	readonly comparisonLabel: string;
	readonly options: ChartOptions;
	readonly onBarClick?: (point: MonthPoint) => void;
}) {
	const format = options.format ?? formatCount;
	const compact = options.compact === true;
	const current = points.find((p) => p.isCurrent);
	const stepDown = options.mark === 'cell';
	return (
		<ChartContainer
			className={cn('w-full', height(options))}
			config={config(options, periodLabel, comparisonLabel)}
		>
			<BarChart
				barCategoryGap={compact ? '20%' : '28%'}
				barGap={2}
				data={points}
				margin={
					compact
						? { top: 4, right: 4, bottom: 2, left: 4 }
						: { top: 8, right: 12, bottom: 0, left: 0 }
				}
			>
				{compact ? null : (
					<CartesianGrid stroke="var(--border)" strokeOpacity={0.6} vertical={false} />
				)}
				<XAxis axisLine={false} dataKey="label" hide={compact} tickLine={false} tickMargin={6} />
				<YAxis
					axisLine={false}
					hide={compact}
					tickFormatter={(v: number) => format(v)}
					tickLine={false}
					width={44}
				/>
				<ChartTooltip
					content={<ChartTooltipContent formatter={tooltipFormatter(format)} />}
					cursor={{ fill: 'var(--muted)', fillOpacity: 0.6 }}
				/>
				<Bar
					dataKey="lastYear"
					fill="var(--color-comparison)"
					isAnimationActive={false}
					maxBarSize={24}
					name={comparisonLabel}
					radius={[3, 3, 0, 0]}
				/>
				<Bar
					className={onBarClick ? 'cursor-pointer' : ''}
					dataKey="period"
					fill="var(--color-period)"
					isAnimationActive={false}
					maxBarSize={24}
					name={periodLabel}
					onClick={(_entry, index) => {
						const point = points[index];
						if (onBarClick && point) onBarClick(point);
					}}
					radius={[3, 3, 0, 0]}
				>
					{points.map((point) => (
						<Cell
							fill={stepDown && !point.isCurrent ? PERIOD_STEP_DOWN : 'var(--color-period)'}
							key={point.month}
						/>
					))}
				</Bar>
				{options.mark === 'line' && current !== undefined ? (
					<ReferenceLine
						stroke={MARK_STROKE}
						strokeDasharray="3 3"
						strokeOpacity={0.7}
						x={current.label}
					/>
				) : null}
			</BarChart>
		</ChartContainer>
	);
}

// --- Annual: the years --------------------------------------------------------

export function YearsBars({
	points,
	label,
	options,
	onBarClick,
}: {
	readonly points: readonly YearPoint[];
	readonly label: string;
	readonly options: ChartOptions;
	readonly onBarClick?: (point: YearPoint) => void;
}) {
	const format = options.format ?? formatCount;
	const compact = options.compact === true;
	const current = points.find((p) => p.isCurrent);
	const stepDown = options.mark === 'cell';
	return (
		<ChartContainer className={cn('w-full', height(options))} config={config(options, label)}>
			<BarChart
				barCategoryGap={compact ? '15%' : '25%'}
				data={points}
				margin={
					compact
						? { top: 4, right: 4, bottom: 2, left: 4 }
						: { top: 8, right: 12, bottom: 0, left: 0 }
				}
			>
				{compact ? null : (
					<CartesianGrid stroke="var(--border)" strokeOpacity={0.6} vertical={false} />
				)}
				<XAxis
					axisLine={false}
					dataKey="label"
					hide={compact}
					interval="preserveStartEnd"
					minTickGap={24}
					tickLine={false}
					tickMargin={6}
				/>
				<YAxis
					axisLine={false}
					hide={compact}
					tickFormatter={(v: number) => format(v)}
					tickLine={false}
					width={44}
				/>
				<ChartTooltip
					content={<ChartTooltipContent formatter={tooltipFormatter(format)} />}
					cursor={{ fill: 'var(--muted)', fillOpacity: 0.6 }}
				/>
				<Bar
					className={onBarClick ? 'cursor-pointer' : ''}
					dataKey="value"
					fill="var(--color-period)"
					isAnimationActive={false}
					maxBarSize={24}
					name={label}
					onClick={(_entry, index) => {
						const point = points[index];
						if (onBarClick && point) onBarClick(point);
					}}
					radius={[3, 3, 0, 0]}
				>
					{points.map((point) => (
						<Cell
							fill={stepDown && !point.isCurrent ? PERIOD_STEP_DOWN : 'var(--color-period)'}
							key={point.year}
						/>
					))}
				</Bar>
				{options.mark === 'line' && current !== undefined ? (
					<ReferenceLine
						stroke={MARK_STROKE}
						strokeDasharray="3 3"
						strokeOpacity={0.7}
						x={current.label}
					/>
				) : null}
			</BarChart>
		</ChartContainer>
	);
}
