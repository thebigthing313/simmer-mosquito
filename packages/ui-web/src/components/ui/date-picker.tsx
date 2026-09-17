import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Calendar } from '@simmer-mosquito/ui-web/components/ui/calendar';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { format } from 'date-fns';
import type { Matcher } from 'react-day-picker';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
	CalendarIcon,
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
} from '../../icons/registry';

export interface DatePickerProps {
	/** The selected day, or undefined when nothing is chosen. */
	readonly value: Date | undefined;
	/** Fired with the chosen day, or undefined when the selection is cleared. */
	readonly onChange: (date: Date | undefined) => void;
	/** Earliest selectable day (inclusive). Earlier days are disabled. */
	readonly min?: Date | undefined;
	/** Latest selectable day (inclusive). Later days are disabled. */
	readonly max?: Date | undefined;
	/** Trigger text shown when no day is selected. */
	readonly placeholder?: string;
	/** date-fns format for the trigger label. Defaults to `MMM d, yyyy`. */
	readonly displayFormat?: string;
	readonly disabled?: boolean;
	readonly ariaLabel?: string;
	readonly id?: string;
	readonly className?: string;
}

/**
 * A single-date picker: a button trigger showing the formatted day, opening a
 * `Calendar` in a `Popover`. Composed from the shared shadcn primitives rather
 * than a native `<input type="date">`, so it inherits the app's surface, focus,
 * and typography instead of the browser's control chrome. Range selection is two
 * of these (a start and an end), each bounded by the other via `min`/`max`.
 *
 * The popover is three screens rather than one, because a calendar that pages a
 * month at a time is a calendar you cannot leave. Reaching a habitat inspected
 * three years ago meant 36 presses of the same arrow, with the month name above
 * it inert the whole way. So the month and the year in the caption are each a
 * button into a grid of their own, and the year grid pages twelve at a time:
 * any day in the record's history is three presses away.
 */
export function DatePicker({
	value,
	onChange,
	min,
	max,
	placeholder = 'Pick a date',
	displayFormat = 'MMM d, yyyy',
	disabled = false,
	ariaLabel,
	id,
	className,
}: DatePickerProps) {
	const [open, setOpen] = useState(false);

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button
					aria-label={ariaLabel}
					className={cn(
						'justify-start gap-2 font-normal',
						value === undefined && 'text-muted-foreground',
						className,
					)}
					disabled={disabled}
					id={id}
					variant="outline"
				>
					<CalendarIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
					<span className="truncate">
						{value === undefined ? placeholder : format(value, displayFormat)}
					</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-auto p-0">
				{/*
				 * Keyed on `open`, so every visit starts on the day grid at the
				 * selected month. Without the key the popover reopens wherever it was
				 * left, which for a reader who drilled to the year grid and pressed
				 * Escape is a picker that opens on a wall of years.
				 */}
				<DatePickerPanel
					key={open ? 'open' : 'shut'}
					max={max}
					min={min}
					onSelect={(date) => {
						onChange(date);
						setOpen(false);
					}}
					value={value}
				/>
			</PopoverContent>
		</Popover>
	);
}

/** Which of the three screens is in front. */
type Screen = 'days' | 'months' | 'years';

/** How many years one page of the year grid holds: three columns by four rows. */
const YEARS_PER_PAGE = 12;

/**
 * How far an arrow moves the year grid.
 *
 * A decade, not a page. A page is twelve years and a page-sized stride aligns
 * every page to a multiple of twelve, so the grid reads "2016 to 2027": a
 * window with no meaning to anybody, on a screen whose whole job is to let a
 * reader aim at a year they already have in mind. A decade-aligned page reads
 * as the decade it is, and the twelfth and first cells repeating across the
 * boundary are the continuity that makes stepping feel like scrolling.
 */
const YEAR_PAGE_STRIDE = 10;

/**
 * The three screens, and the one month they all describe.
 *
 * The visible month is state here rather than inside `Calendar`, because the
 * month and year grids set it too: picking August on the month grid is the same
 * write as pressing the day grid's next arrow eight times.
 */
function DatePickerPanel({
	value,
	min,
	max,
	onSelect,
}: {
	readonly value: Date | undefined;
	readonly min: Date | undefined;
	readonly max: Date | undefined;
	readonly onSelect: (date: Date) => void;
}) {
	const today = startOfDay(new Date());
	// The selected day, else today, else whichever bound is in reach. A picker
	// bounded at 1999 must not open on a 2026 the reader cannot select from.
	const [month, setMonth] = useState(() => startOfMonth(value ?? clamp(today, min, max)));
	const [screen, setScreen] = useState<Screen>('days');
	// Which way the last change went, so the new screen slides in from the side
	// it came from. Drilling in reads as going deeper, coming back as coming out.
	const [direction, setDirection] = useState<'in' | 'out'>('in');
	const [yearPageStart, setYearPageStart] = useState(() => pageStart(month.getFullYear()));

	const go = (next: Screen, way: 'in' | 'out') => {
		if (next === 'years') {
			setYearPageStart(pageStart(month.getFullYear()));
		}
		setDirection(way);
		setScreen(next);
	};

	const outOfRange: Matcher[] = [];
	if (min !== undefined) {
		outOfRange.push({ before: min });
	}
	if (max !== undefined) {
		outOfRange.push({ after: max });
	}

	return (
		// `relative`: the day grid stays in the flow and is what gives the popover
		// its height, and the other two screens are laid over the same box. A stack
		// that swapped them in the flow would resize the popover on every drill,
		// which is the jump `fixedWeeks` already refuses within the day grid.
		<div className="relative">
			<div inert={screen !== 'days'}>
				<DayScreen
					max={max}
					min={min}
					month={month}
					onMonthChange={setMonth}
					onOpenMonths={() => go('months', 'in')}
					onOpenYears={() => go('years', 'in')}
					onSelect={onSelect}
					outOfRange={outOfRange}
					today={today}
					value={value}
				/>
			</div>

			{screen === 'months' ? (
				<Overlay direction={direction} label="Pick a month">
					<MonthScreen
						max={max}
						min={min}
						month={month}
						onOpenYears={() => go('years', 'in')}
						onPick={(picked) => {
							setMonth(picked);
							go('days', 'out');
						}}
						onStepYear={(years) => setMonth(addMonths(month, years * 12))}
					/>
				</Overlay>
			) : null}

			{screen === 'years' ? (
				<Overlay direction={direction} label="Pick a year">
					<YearScreen
						pageStart={yearPageStart}
						max={max}
						min={min}
						month={month}
						onPick={(year) => {
							setMonth(withYear(month, year));
							go('months', 'out');
						}}
						onStepPage={(pages) => setYearPageStart(yearPageStart + pages * YEAR_PAGE_STRIDE)}
					/>
				</Overlay>
			) : null}
		</div>
	);
}

/**
 * A screen laid over the day grid.
 *
 * Opaque, because the grid underneath is still in the flow holding the height
 * open. `inert` on that grid is what keeps it out of the tab order while it is
 * covered, so Tab from the last month button lands outside the popover rather
 * than walking 42 days nobody can see.
 *
 * The slide says which way the reader went. 180ms and `ease-out` is the product
 * register's range: long enough to read as one screen replacing another, short
 * enough that a reader stepping through four years never waits on it. Under
 * `prefers-reduced-motion` the travel goes and the crossfade stays, because the
 * fade alone still says a screen changed.
 */
function Overlay({
	children,
	direction,
	label,
}: {
	readonly children: ReactNode;
	readonly direction: 'in' | 'out';
	readonly label: string;
}) {
	return (
		<div
			aria-label={label}
			className={cn(
				// `z-20` clears the day grid's focused day, which `Calendar` raises to
				// `z-10` so its focus ring draws over the neighbouring cells. Without
				// it that one day floats over an otherwise opaque overlay, ring and
				// all, which reads as a rendering fault rather than a stacking one.
				'absolute inset-0 z-20 flex animate-in flex-col rounded-md bg-popover fade-in-0 duration-200 ease-out',
				direction === 'in' ? 'slide-in-from-right-4' : 'slide-in-from-left-4',
				// Reduced motion keeps the crossfade and drops the travel, rather than
				// dropping both. A fade is the recommended substitute for a slide, and
				// it is still what says a screen changed; `animate-none` here would
				// swap three screens with nothing at all between them.
				'motion-reduce:[--tw-enter-translate-x:0px]',
			)}
			role="group"
		>
			{children}
		</div>
	);
}

/** The day grid, its caption split into two buttons, and Today under it. */
function DayScreen({
	max,
	min,
	month,
	onMonthChange,
	onOpenMonths,
	onOpenYears,
	onSelect,
	outOfRange,
	today,
	value,
}: {
	readonly max: Date | undefined;
	readonly min: Date | undefined;
	readonly month: Date;
	readonly onMonthChange: (next: Date) => void;
	readonly onOpenMonths: () => void;
	readonly onOpenYears: () => void;
	readonly onSelect: (date: Date) => void;
	readonly outOfRange: readonly Matcher[];
	readonly today: Date;
	readonly value: Date | undefined;
}) {
	const canStepBack = min === undefined || startOfMonth(min) < startOfMonth(month);
	const canStepOn = max === undefined || startOfMonth(max) > startOfMonth(month);
	const todayInRange = inRange(today, min, max);

	return (
		<div className="flex flex-col">
			<ScreenHeader
				canStepBack={canStepBack}
				canStepOn={canStepOn}
				onStep={(months) => onMonthChange(addMonths(month, months))}
				stepLabel="month"
			>
				<CaptionButton label="Pick a month" onClick={onOpenMonths}>
					{format(month, 'MMMM')}
				</CaptionButton>
				<CaptionButton label="Pick a year" onClick={onOpenYears}>
					{format(month, 'yyyy')}
				</CaptionButton>
			</ScreenHeader>

			<Calendar
				autoFocus
				className="px-3 pt-0 pb-3"
				/*
				 * Always six week rows, padded with the neighbouring months' days.
				 * A calendar month spans four, five, or six weeks depending on the
				 * weekday it starts on, so an unpadded grid changes height as you
				 * page through it: the popup jumps, and the day under the cursor
				 * is no longer the day you were about to click.
				 */
				fixedWeeks
				// The caption and the nav are drawn above, as buttons. Hidden rather
				// than left in place, or the month name would be on screen twice, once
				// as a label and once as the control that opens the month grid.
				classNames={{ month_caption: 'hidden', nav: 'hidden' }}
				mode="single"
				month={month}
				onMonthChange={onMonthChange}
				onSelect={(date) => {
					if (date !== undefined) {
						onSelect(date);
					}
				}}
				{...(value !== undefined ? { selected: value } : {})}
				{...(outOfRange.length > 0 ? { disabled: [...outOfRange] } : {})}
			/>

			<div className="border-border/60 border-t p-2">
				<Button
					className="w-full"
					disabled={!todayInRange}
					onClick={() => onSelect(today)}
					size="sm"
					type="button"
					variant="ghost"
				>
					Today
				</Button>
			</div>
		</div>
	);
}

/** Twelve months of one year. The year in the header opens the year grid. */
function MonthScreen({
	max,
	min,
	month,
	onOpenYears,
	onPick,
	onStepYear,
}: {
	readonly max: Date | undefined;
	readonly min: Date | undefined;
	readonly month: Date;
	readonly onOpenYears: () => void;
	readonly onPick: (picked: Date) => void;
	readonly onStepYear: (years: number) => void;
}) {
	const year = month.getFullYear();
	return (
		<div className="flex flex-1 flex-col">
			<ScreenHeader
				canStepBack={min === undefined || min.getFullYear() < year}
				canStepOn={max === undefined || max.getFullYear() > year}
				onStep={onStepYear}
				stepLabel="year"
			>
				<CaptionButton label="Pick a year" onClick={onOpenYears}>
					{year}
				</CaptionButton>
			</ScreenHeader>
			<PickerGrid>
				{MONTH_NAMES.map((name, index) => {
					const candidate = new Date(year, index, 1);
					return (
						<PickerCell
							disabled={!monthInRange(candidate, min, max)}
							isCurrent={index === month.getMonth()}
							key={name}
							onClick={() => onPick(candidate)}
						>
							{name}
						</PickerCell>
					);
				})}
			</PickerGrid>
		</div>
	);
}

/** One decade of years, with the year either side of it. Picking one drops back to its months. */
function YearScreen({
	pageStart: start,
	max,
	min,
	month,
	onPick,
	onStepPage,
}: {
	readonly pageStart: number;
	readonly max: Date | undefined;
	readonly min: Date | undefined;
	readonly month: Date;
	readonly onPick: (year: number) => void;
	readonly onStepPage: (pages: number) => void;
}) {
	const years = Array.from({ length: YEARS_PER_PAGE }, (_, index) => start + index);
	const last = start + YEARS_PER_PAGE - 1;
	return (
		<div className="flex flex-1 flex-col">
			<ScreenHeader
				canStepBack={min === undefined || min.getFullYear() < start}
				canStepOn={max === undefined || max.getFullYear() > last}
				onStep={onStepPage}
				stepLabel="decade"
			>
				{/*
				 * The range is a label rather than a button. There is no fourth screen
				 * to drill into, and a caption that looks like the two above it but
				 * does nothing is worse than one that plainly does not.
				 */}
				<span className="px-2 font-medium text-foreground text-sm tabular-nums">
					{start}&ndash;{last}
				</span>
			</ScreenHeader>
			<PickerGrid>
				{years.map((year) => (
					<PickerCell
						disabled={!yearInRange(year, min, max)}
						isCurrent={year === month.getFullYear()}
						key={year}
						onClick={() => onPick(year)}
					>
						{year}
					</PickerCell>
				))}
			</PickerGrid>
		</div>
	);
}

/**
 * The row every screen opens with: step back, the caption, step on.
 *
 * One component for all three, because the arrows are the same control taking a
 * different stride, and three copies of a nav row is how the day screen's and
 * the month screen's arrows end up different sizes.
 */
function ScreenHeader({
	canStepBack,
	canStepOn,
	children,
	onStep,
	stepLabel,
}: {
	readonly canStepBack: boolean;
	readonly canStepOn: boolean;
	readonly children: ReactNode;
	readonly onStep: (steps: number) => void;
	readonly stepLabel: string;
}) {
	return (
		<div className="flex items-center justify-between gap-1 p-3 pb-2">
			<Button
				aria-label={`Previous ${stepLabel}`}
				disabled={!canStepBack}
				onClick={() => onStep(-1)}
				size="icon-sm"
				type="button"
				variant="ghost"
			>
				<ChevronLeftIcon aria-hidden="true" />
			</Button>
			<div className="flex min-w-0 items-center gap-0.5">{children}</div>
			<Button
				aria-label={`Next ${stepLabel}`}
				disabled={!canStepOn}
				onClick={() => onStep(1)}
				size="icon-sm"
				type="button"
				variant="ghost"
			>
				<ChevronRightIcon aria-hidden="true" />
			</Button>
		</div>
	);
}

/**
 * A caption that opens the screen below it.
 *
 * It reads as a label and behaves as a button, which is the whole point: the
 * month name was already the most-looked-at text in the popover, and it was the
 * one thing in it that did nothing. The hover fill is what says otherwise
 * before it is pressed.
 */
function CaptionButton({
	children,
	label,
	onClick,
}: {
	readonly children: ReactNode;
	readonly label: string;
	readonly onClick: () => void;
}) {
	return (
		<button
			aria-label={label}
			className="flex items-center gap-1 rounded-md py-1 pr-1 pl-2 font-medium text-foreground text-sm tabular-nums transition-colors duration-150 ease-out hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
			onClick={onClick}
			type="button"
		>
			{children}
			{/*
			 * The chevron is the affordance at rest. A caption that only reveals
			 * itself on hover is a control a touch reader never finds, and this one
			 * is the way out of a calendar that otherwise pages a month at a time.
			 * `shadcn`'s own dropdown caption draws the same mark for the same
			 * reason.
			 */}
			<ChevronDownIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
		</button>
	);
}

/**
 * Three columns, four rows, centred in whatever height the day grid left.
 *
 * `content-center` rather than four stretched rows. Filling the frame is the
 * frame's job and this grid has fewer cells than the day grid does, so rows
 * that stretched turned a selected month into a 75px slab of primary green
 * three times the weight of the selected day it stands in for.
 */
function PickerGrid({ children }: { readonly children: ReactNode }) {
	return (
		<div className="grid flex-1 content-center grid-cols-3 gap-1.5 gap-y-2.5 p-3 pt-1">
			{children}
		</div>
	);
}

/**
 * One month or one year.
 *
 * `aria-current` rather than `aria-pressed`: the highlighted cell is where the
 * calendar is standing, not a control the reader has switched on, and a screen
 * reader announcing "pressed" on the month you are looking at is a different
 * claim.
 *
 * The highlight is also the way back. A reader who opened the grid to look and
 * changed their mind presses the cell that is already lit and lands on the
 * screen behind with nothing altered, which is why there is no back control
 * beside the two arrows. Escape still closes the popover, as it does on every
 * other one in the product.
 */
function PickerCell({
	children,
	disabled,
	isCurrent,
	onClick,
}: {
	readonly children: ReactNode;
	readonly disabled: boolean;
	readonly isCurrent: boolean;
	readonly onClick: () => void;
}) {
	const ref = useRef<HTMLButtonElement>(null);
	// Focus follows the drill, so the keyboard lands where the eye already is and
	// the arrow keys of the next grid start from the current month or year.
	useEffect(() => {
		if (isCurrent) {
			ref.current?.focus();
		}
	}, [isCurrent]);

	return (
		<Button
			aria-current={isCurrent ? 'true' : undefined}
			className={cn(
				'h-10 w-full font-normal text-sm tabular-nums',
				isCurrent &&
					'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
			)}
			disabled={disabled}
			onClick={onClick}
			ref={ref}
			type="button"
			variant="ghost"
		>
			{children}
		</Button>
	);
}

const MONTH_NAMES = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec',
] as const;

/**
 * The first year of the page `year` falls in: the year before its decade.
 *
 * So 2026 opens on 2019 to 2030, which holds the whole of the 2020s and one
 * year of context at each end.
 */
function pageStart(year: number): number {
	return Math.floor(year / YEAR_PAGE_STRIDE) * YEAR_PAGE_STRIDE - 1;
}

function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Calendar arithmetic, so December plus one is next January rather than a rollover. */
function addMonths(date: Date, months: number): Date {
	return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function withYear(date: Date, year: number): Date {
	return new Date(year, date.getMonth(), 1);
}

function inRange(date: Date, min: Date | undefined, max: Date | undefined): boolean {
	if (min !== undefined && date < startOfDay(min)) {
		return false;
	}
	return max === undefined || date <= startOfDay(max);
}

function clamp(date: Date, min: Date | undefined, max: Date | undefined): Date {
	if (min !== undefined && date < min) {
		return min;
	}
	return max !== undefined && date > max ? max : date;
}

/**
 * Whether any day of `candidate`'s month is selectable.
 *
 * The month rather than its first day: a `min` of the 15th leaves the second
 * half of that month selectable, and disabling the whole month would put a
 * reachable day behind a control that refuses to open on it.
 */
function monthInRange(candidate: Date, min: Date | undefined, max: Date | undefined): boolean {
	const first = startOfMonth(candidate);
	const next = addMonths(first, 1);
	if (min !== undefined && next <= startOfDay(min)) {
		return false;
	}
	return max === undefined || first <= startOfDay(max);
}

/** The same rule a year wide. */
function yearInRange(year: number, min: Date | undefined, max: Date | undefined): boolean {
	if (min !== undefined && year < min.getFullYear()) {
		return false;
	}
	return max === undefined || year <= max.getFullYear();
}
