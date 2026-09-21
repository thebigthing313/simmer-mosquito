/**
 * PROTOTYPE. Three variants of the period-in-review page, switchable via
 * `?variant=`, mounted on the existing `/today`, `/monthly` and `/annual`
 * routes in place of the `UpcomingPage` stub (#1201). Static data from
 * `prototype-data.ts`. The floating bar at the bottom flips variants, the
 * marking style and the comparison colour. Throw away with the branch.
 */

import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { DatePicker } from '@simmer-mosquito/ui-web/components/ui/date-picker';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from '@simmer-mosquito/ui-web/components/ui/select';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { type ReactNode, useEffect } from 'react';
import { formatCount } from '../../lib/format-count';
import type { ComparisonStep, MarkStyle } from './prototype-charts';
import {
	type Cell,
	CURRENT_DAY,
	CURRENT_MONTH,
	CURRENT_YEAR,
	currentPeriod,
	daysInMonth,
	EARLIEST_YEAR,
	firstDayOf,
	formatRatio,
	type Grain,
	isCurrent,
	lastDayOf,
	MONTH_LONG,
	type Period,
	pad,
	periodLabel,
	periodLongLabel,
	type RatioCell,
	type RatioKey,
	stepPeriod,
	type TypeSpec,
} from './prototype-data';
import { VariantLedger } from './variant-a-ledger';
import { VariantPanels } from './variant-b-panels';
import { VariantFocus } from './variant-c-focus';

const ChartIcon = iconRegistry.generic.chart.icon;
const PrevIcon = iconRegistry.arrows.chevronLeft.icon;
const NextIcon = iconRegistry.arrows.chevronRight.icon;

const VARIANTS = [
	{ key: 'A', name: 'Ledger, chart beside each row', Component: VariantLedger },
	{ key: 'B', name: 'Table, then a grid of charts', Component: VariantPanels },
	{ key: 'C', name: 'Table beside one chart with a selector', Component: VariantFocus },
] as const;
type VariantKey = (typeof VARIANTS)[number]['key'];

const MARKS: readonly MarkStyle[] = ['cell', 'line'];
const COMPARISONS: readonly ComparisonStep[] = ['green300', 'green200', 'green100'];

const TITLES: Record<Grain, string> = { day: 'Today', month: 'Monthly', year: 'Annual' };
const DESCRIPTIONS: Record<Grain, string> = {
	day: 'What was recorded on one day, against the day before, the same date last year and the five years before.',
	month:
		'What was recorded in one month, against the month before, the same month last year and the five years before.',
	year: 'What was recorded in one year, against the year before and the five years before.',
};

// --- the search params -------------------------------------------------------

interface LooseSearch {
	readonly variant?: string;
	readonly mark?: string;
	readonly comparison?: string;
	readonly date?: string;
	readonly month?: string;
	readonly year?: string;
}

function readPeriod(grain: Grain, search: LooseSearch): Period {
	const current = currentPeriod(grain);
	if (grain === 'day') {
		const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(search.date ?? '');
		if (!m) return current;
		const period = { grain, year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
		return isFuture(period) ? current : period;
	}
	if (grain === 'month') {
		const m = /^(\d{4})-(\d{2})$/.exec(search.month ?? '');
		if (!m) return current;
		const period = { grain, year: Number(m[1]), month: Number(m[2]), day: 1 };
		return isFuture(period) || period.month > 12 ? current : period;
	}
	const m = /^(\d{4})$/.exec(search.year ?? '');
	if (!m) return current;
	const period = { grain, year: Number(m[1]), month: 1, day: 1 };
	return isFuture(period) ? current : period;
}

function isFuture(period: Period): boolean {
	if (period.year > CURRENT_YEAR) return true;
	if (period.year < CURRENT_YEAR || period.grain === 'year') return false;
	if (period.month > CURRENT_MONTH) return true;
	if (period.month < CURRENT_MONTH || period.grain === 'month') return false;
	return period.day > CURRENT_DAY;
}

/** The search value for a period: explicit, or absent when it is the current one. */
export function periodParam(period: Period): Record<string, string | undefined> {
	if (period.grain === 'day') {
		return { date: isCurrent(period) ? undefined : firstDayOf(period) };
	}
	if (period.grain === 'month') {
		return { month: isCurrent(period) ? undefined : `${period.year}-${pad(period.month)}` };
	}
	return { year: isCurrent(period) ? undefined : String(period.year) };
}

/** An explicit param, the way a bar link writes it. */
export function explicitParam(period: Period): Record<string, string> {
	if (period.grain === 'day') return { date: firstDayOf(period) };
	if (period.grain === 'month') return { month: `${period.year}-${pad(period.month)}` };
	return { year: String(period.year) };
}

const ROUTE: Record<Grain, '/today' | '/monthly' | '/annual'> = {
	day: '/today',
	month: '/monthly',
	year: '/annual',
};

export interface VariantProps {
	readonly grain: Grain;
	readonly period: Period;
	readonly options: { readonly mark: MarkStyle; readonly comparison: ComparisonStep };
	readonly openPeriod: (period: Period) => void;
}

// --- the page ----------------------------------------------------------------

export function PeriodReviewPrototype({ grain }: { readonly grain: Grain }) {
	const search = useSearch({ strict: false }) as LooseSearch;
	const navigate = useNavigate();
	const variant = (VARIANTS.find((v) => v.key === search.variant)?.key ?? 'A') as VariantKey;
	const mark = MARKS.includes(search.mark as MarkStyle) ? (search.mark as MarkStyle) : 'cell';
	const comparison = COMPARISONS.includes(search.comparison as ComparisonStep)
		? (search.comparison as ComparisonStep)
		: 'green300';
	const period = readPeriod(grain, search);

	const prototypeSearch = { variant, mark, comparison };

	const setPeriod = (next: Period) => {
		void navigate({
			to: ROUTE[grain],
			search: { ...prototypeSearch, ...periodParam(next) } as never,
			replace: true,
		});
	};

	const openPeriod = (next: Period) => {
		void navigate({
			to: ROUTE[next.grain],
			search: { ...prototypeSearch, ...explicitParam(next) } as never,
		});
	};

	const setPrototype = (patch: Partial<typeof prototypeSearch>) => {
		void navigate({
			to: ROUTE[grain],
			search: { ...prototypeSearch, ...periodParam(period), ...patch } as never,
			replace: true,
		});
	};

	const Variant = VARIANTS.find((v) => v.key === variant)?.Component ?? VariantLedger;

	return (
		<div className={pageContainer({ gap: 'overview', measure: 'record', padding: 'page' })}>
			<PageHeader
				actions={<PeriodPicker period={period} setPeriod={setPeriod} />}
				description={DESCRIPTIONS[grain]}
				eyebrow="Organization"
				icon={ChartIcon}
				title={TITLES[grain]}
			/>
			<UpwardLine period={period} openPeriod={openPeriod} />
			<Variant
				grain={grain}
				openPeriod={openPeriod}
				options={{ mark, comparison }}
				period={period}
			/>
			<PrototypeBar
				comparison={comparison}
				mark={mark}
				setPrototype={setPrototype}
				variant={variant}
			/>
		</div>
	);
}

/** One line under the heading naming the coarser periods this one sits in. */
function UpwardLine({
	period,
	openPeriod,
}: {
	readonly period: Period;
	readonly openPeriod: (period: Period) => void;
}) {
	if (period.grain === 'year') return null;
	const month: Period = { ...period, grain: 'month', day: 1 };
	const year: Period = { ...period, grain: 'year', month: 1, day: 1 };
	return (
		<p className="-mt-3 m-0 flex items-center gap-2 text-muted-foreground text-sm">
			<span className="font-medium text-foreground">{periodLongLabel(period)}</span>
			<span aria-hidden="true">·</span>
			{period.grain === 'day' ? (
				<>
					<button
						className="text-primary underline-offset-4 hover:underline"
						onClick={() => openPeriod(month)}
						type="button"
					>
						{`${MONTH_LONG[period.month - 1]} ${period.year}`}
					</button>
					<span aria-hidden="true">·</span>
				</>
			) : null}
			<button
				className="text-primary underline-offset-4 hover:underline"
				onClick={() => openPeriod(year)}
				type="button"
			>
				{String(period.year)}
			</button>
		</p>
	);
}

// --- the picker --------------------------------------------------------------

function PeriodPicker({
	period,
	setPeriod,
}: {
	readonly period: Period;
	readonly setPeriod: (period: Period) => void;
}) {
	const earliest: Period = { grain: period.grain, year: EARLIEST_YEAR, month: 1, day: 1 };
	const atEarliest =
		period.year === EARLIEST_YEAR &&
		(period.grain === 'year' ||
			(period.month === 1 && (period.grain === 'month' || period.day === 1)));
	const atCurrent = isCurrent(period);
	return (
		<div className="flex items-center gap-1.5">
			<Button
				aria-label={`Previous ${period.grain}`}
				disabled={atEarliest}
				onClick={() => setPeriod(stepPeriod(period, -1))}
				size="icon-sm"
				variant="outline"
			>
				<PrevIcon aria-hidden="true" />
			</Button>
			{period.grain === 'day' ? (
				<DatePicker
					ariaLabel="Day shown"
					className="w-40"
					max={new Date(CURRENT_YEAR, CURRENT_MONTH - 1, CURRENT_DAY)}
					min={new Date(earliest.year, 0, 1)}
					onChange={(date) => {
						if (date) {
							setPeriod({
								grain: 'day',
								year: date.getFullYear(),
								month: date.getMonth() + 1,
								day: date.getDate(),
							});
						}
					}}
					value={new Date(period.year, period.month - 1, period.day)}
				/>
			) : period.grain === 'month' ? (
				<MonthSelect period={period} setPeriod={setPeriod} />
			) : (
				<YearSelect period={period} setPeriod={setPeriod} />
			)}
			<Button
				aria-label={`Next ${period.grain}`}
				disabled={atCurrent}
				onClick={() => setPeriod(stepPeriod(period, 1))}
				size="icon-sm"
				variant="outline"
			>
				<NextIcon aria-hidden="true" />
			</Button>
			{atCurrent ? null : (
				<Button onClick={() => setPeriod(currentPeriod(period.grain))} size="sm" variant="ghost">
					{period.grain === 'day' ? 'Today' : period.grain === 'month' ? 'This month' : 'This year'}
				</Button>
			)}
		</div>
	);
}

function MonthSelect({
	period,
	setPeriod,
}: {
	readonly period: Period;
	readonly setPeriod: (period: Period) => void;
}) {
	const years: number[] = [];
	for (let year = CURRENT_YEAR; year >= EARLIEST_YEAR; year -= 1) years.push(year);
	const value = `${period.year}-${pad(period.month)}`;
	return (
		<Select
			onValueChange={(next) => {
				const [year, month] = next.split('-').map(Number);
				if (year && month) setPeriod({ grain: 'month', year, month, day: 1 });
			}}
			value={value}
		>
			<SelectTrigger aria-label="Month shown" className="w-44" size="sm">
				<SelectValue />
			</SelectTrigger>
			<SelectContent className="max-h-80">
				{years.map((year) => (
					<SelectGroup key={year}>
						<SelectLabel>{year}</SelectLabel>
						{Array.from({ length: year === CURRENT_YEAR ? CURRENT_MONTH : 12 }, (_, i) => {
							const month = year === CURRENT_YEAR ? CURRENT_MONTH - i : 12 - i;
							return (
								<SelectItem key={month} value={`${year}-${pad(month)}`}>
									{`${MONTH_LONG[month - 1]} ${year}`}
								</SelectItem>
							);
						})}
					</SelectGroup>
				))}
			</SelectContent>
		</Select>
	);
}

function YearSelect({
	period,
	setPeriod,
}: {
	readonly period: Period;
	readonly setPeriod: (period: Period) => void;
}) {
	const years: number[] = [];
	for (let year = CURRENT_YEAR; year >= EARLIEST_YEAR; year -= 1) years.push(year);
	return (
		<Select
			onValueChange={(next) => setPeriod({ grain: 'year', year: Number(next), month: 1, day: 1 })}
			value={String(period.year)}
		>
			<SelectTrigger aria-label="Year shown" className="w-28" size="sm">
				<SelectValue />
			</SelectTrigger>
			<SelectContent className="max-h-80">
				{years.map((year) => (
					<SelectItem key={year} value={String(year)}>
						{year}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

// --- cells the variants share ------------------------------------------------

/** The period a column's link covers: the shown period, or a comparison one. */
export function columnPeriod(period: Period, index: number): Period | null {
	if (index === 0) return period;
	if (period.grain === 'year') return index === 1 ? stepPeriod(period, -1) : null;
	if (index === 1) return stepPeriod(period, -1);
	if (index === 2) return { ...period, year: period.year - 1 };
	return null;
}

export function CountCell({
	type,
	cell,
	at,
	emphasis = false,
}: {
	readonly type: TypeSpec;
	readonly cell: Cell;
	/** The period the link covers, or `null` for the average column. */
	readonly at: Period | null;
	readonly emphasis?: boolean;
}) {
	if (cell === null) {
		return <AbsentValue />;
	}
	const text = formatCount(cell);
	if (at === null) {
		return <span className={cn('tabular-nums', emphasis && 'font-semibold')}>{text}</span>;
	}
	return (
		<Link
			className={cn(
				'tabular-nums underline-offset-4 hover:underline',
				emphasis ? 'font-semibold text-foreground' : 'text-foreground',
			)}
			search={{ from: firstDayOf(at), to: lastDayOf(at) } as never}
			to={type.explorer as never}
		>
			{text}
		</Link>
	);
}

export function RatioCellView({
	ratio,
	cell,
	emphasis = false,
}: {
	readonly ratio: RatioKey;
	readonly cell: RatioCell;
	readonly emphasis?: boolean;
}) {
	return (
		<span className={cn('tabular-nums', emphasis && 'font-semibold')}>
			{cell.value === null ? <AbsentValue /> : formatRatio(ratio, cell.value)}
			<span className="ml-1 text-muted-foreground text-xs">({formatCount(cell.beside)})</span>
		</span>
	);
}

/** The words for the chart legend and tooltip at each grain. */
export function seriesLabels(period: Period): { period: string; comparison: string } {
	return { period: String(period.year), comparison: String(period.year - 1) };
}

export function Swatch({ color, label }: { readonly color: string; readonly label: string }) {
	return (
		<span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
			<span
				aria-hidden="true"
				className="inline-block size-2.5 rounded-[2px]"
				style={{ backgroundColor: color }}
			/>
			{label}
		</span>
	);
}

export function Legend({
	period,
	comparison,
}: {
	readonly period: Period;
	readonly comparison: ComparisonStep;
}) {
	const labels = seriesLabels(period);
	if (period.grain !== 'month') return null;
	return (
		<span className="flex items-center gap-3">
			<Swatch color="var(--simmer-green-600)" label={labels.period} />
			<Swatch
				color={`var(--simmer-${comparison.replace('green', 'green-')})`}
				label={labels.comparison}
			/>
		</span>
	);
}

export function daysInPeriod(period: Period): number {
	return daysInMonth(period.year, period.month);
}

// --- the floating bar --------------------------------------------------------

function PrototypeBar({
	variant,
	mark,
	comparison,
	setPrototype,
}: {
	readonly variant: VariantKey;
	readonly mark: MarkStyle;
	readonly comparison: ComparisonStep;
	readonly setPrototype: (patch: {
		variant?: VariantKey;
		mark?: MarkStyle;
		comparison?: ComparisonStep;
	}) => void;
}) {
	const index = VARIANTS.findIndex((v) => v.key === variant);
	const step = (by: number) => {
		const next = VARIANTS[(index + by + VARIANTS.length) % VARIANTS.length];
		if (next) setPrototype({ variant: next.key });
	};
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (
				target &&
				(target.tagName === 'INPUT' ||
					target.tagName === 'TEXTAREA' ||
					target.isContentEditable ||
					target.getAttribute('role') === 'combobox')
			) {
				return;
			}
			if (event.key === 'ArrowLeft') step(-1);
			if (event.key === 'ArrowRight') step(1);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
	if (import.meta.env.PROD) return null;
	const current = VARIANTS[index];
	return (
		<div className="-translate-x-1/2 fixed bottom-4 left-1/2 z-50 flex items-center gap-2 rounded-full border border-border bg-foreground px-2 py-1.5 text-background text-xs shadow-lg">
			<Button
				aria-label="Previous variant"
				className="size-7 rounded-full text-background hover:bg-background/20 hover:text-background"
				onClick={() => step(-1)}
				size="icon-xs"
				variant="ghost"
			>
				<PrevIcon aria-hidden="true" />
			</Button>
			<span className="min-w-[18rem] text-center font-medium">
				{current?.key} · {current?.name}
			</span>
			<Button
				aria-label="Next variant"
				className="size-7 rounded-full text-background hover:bg-background/20 hover:text-background"
				onClick={() => step(1)}
				size="icon-xs"
				variant="ghost"
			>
				<NextIcon aria-hidden="true" />
			</Button>
			<span className="mx-1 h-4 w-px bg-background/30" />
			<BarToggle
				label="mark"
				onChange={(next) => setPrototype({ mark: next as MarkStyle })}
				options={MARKS}
				value={mark}
			/>
			<BarToggle
				label="vs"
				onChange={(next) => setPrototype({ comparison: next as ComparisonStep })}
				options={COMPARISONS}
				value={comparison}
			/>
		</div>
	);
}

function BarToggle({
	label,
	options,
	value,
	onChange,
}: {
	readonly label: string;
	readonly options: readonly string[];
	readonly value: string;
	readonly onChange: (next: string) => void;
}) {
	return (
		<span className="flex items-center gap-1">
			<span className="text-background/60">{label}</span>
			{options.map((option) => (
				<button
					className={cn(
						'rounded-full px-2 py-0.5 font-mono',
						option === value ? 'bg-background text-foreground' : 'hover:bg-background/20',
					)}
					key={option}
					onClick={() => onChange(option)}
					type="button"
				>
					{option}
				</button>
			))}
		</span>
	);
}

export function TableHeadCells({
	headers,
	trailing,
}: {
	readonly headers: readonly string[];
	readonly trailing?: ReactNode;
}) {
	return (
		<>
			{headers.map((header, i) => (
				<th
					className={cn(
						'px-3 py-2 text-right font-medium text-muted-foreground text-xs',
						i === 0 && 'text-foreground',
					)}
					key={header}
					scope="col"
				>
					{header}
				</th>
			))}
			{trailing}
		</>
	);
}

export { periodLabel };
