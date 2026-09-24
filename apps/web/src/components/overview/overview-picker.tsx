/**
 * The period picker in a period-in-review page's header: a previous arrow,
 * the grain's control, a next arrow, and a button back to the current period
 * that appears only when the shown period is not the current one. Takes the
 * shown period, the current one and `earliest`, the picker's two bounds.
 * Next is disabled at the current period and previous at `earliest`; before
 * the response arrives the picker is bounded by today alone.
 *
 * On the day grain the control is a `DatePicker`. On the month grain it is
 * one `Select` over the reachable months, newest first and grouped by year,
 * and on the year grain one `Select` over the reachable years, newest first;
 * on both a period before `earliest` is an extra item at the bottom while it
 * is shown. `docs/web-components.md` has the reasons.
 */

import type { OverviewGrain } from '@simmer-mosquito/domain';
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
import { formatLocalDate, formatMonthYear, parseLocalDate } from '../../lib/local-date';
import { reachableMonths, reachableYears, stepPeriod } from './overview-data';

const PreviousIcon = iconRegistry.arrows.chevronLeft.icon;
const NextIcon = iconRegistry.arrows.chevronRight.icon;

/** The words on the arrows and the button back, per grain. */
const PICKER_COPY: Readonly<
	Record<
		OverviewGrain,
		{ readonly previous: string; readonly next: string; readonly current: string }
	>
> = {
	day: { previous: 'Previous Day', next: 'Next Day', current: 'Today' },
	month: { previous: 'Previous Month', next: 'Next Month', current: 'This Month' },
	year: { previous: 'Previous Year', next: 'Next Year', current: 'This Year' },
};

export function OverviewPicker({
	grain,
	period,
	current,
	earliest,
	onPick,
}: {
	readonly grain: OverviewGrain;
	/** The shown period. */
	readonly period: string;
	/** The current period, the picker's upper bound. */
	readonly current: string;
	/** The earliest period with a record, the lower bound; null until the response says. */
	readonly earliest: string | null;
	readonly onPick: (period: string) => void;
}) {
	const copy = PICKER_COPY[grain];
	const atCurrent = period >= current;
	const atEarliest = earliest !== null && period <= earliest;
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			<Button
				aria-label={copy.previous}
				disabled={atEarliest}
				onClick={() => onPick(stepPeriod(grain, period, -1))}
				size="icon-sm"
				variant="outline"
			>
				<PreviousIcon aria-hidden="true" />
			</Button>
			{grain === 'month' ? (
				<MonthControl current={current} earliest={earliest} onPick={onPick} period={period} />
			) : grain === 'year' ? (
				<YearControl current={current} earliest={earliest} onPick={onPick} period={period} />
			) : (
				<DayControl current={current} earliest={earliest} onPick={onPick} period={period} />
			)}
			<Button
				aria-label={copy.next}
				disabled={atCurrent}
				onClick={() => onPick(stepPeriod(grain, period, 1))}
				size="icon-sm"
				variant="outline"
			>
				<NextIcon aria-hidden="true" />
			</Button>
			{atCurrent ? null : (
				<Button onClick={() => onPick(current)} size="sm" variant="ghost">
					{copy.current}
				</Button>
			)}
		</div>
	);
}

function DayControl({
	period,
	current,
	earliest,
	onPick,
}: {
	readonly period: string;
	readonly current: string;
	readonly earliest: string | null;
	readonly onPick: (period: string) => void;
}) {
	return (
		<DatePicker
			ariaLabel="Day shown"
			className="w-40"
			max={parseLocalDate(current)}
			min={earliest === null ? undefined : parseLocalDate(earliest)}
			onChange={(date) => {
				if (date !== undefined) {
					onPick(formatLocalDate(date));
				}
			}}
			value={parseLocalDate(period)}
		/>
	);
}

function MonthControl({
	period,
	current,
	earliest,
	onPick,
}: {
	readonly period: string;
	readonly current: string;
	readonly earliest: string | null;
	readonly onPick: (period: string) => void;
}) {
	const years = reachableMonths(current, earliest);
	const listed = years.some((group) => group.months.includes(period));
	return (
		<Select onValueChange={onPick} value={period}>
			<SelectTrigger aria-label="Month shown" className="w-44" size="sm">
				<SelectValue />
			</SelectTrigger>
			<SelectContent className="max-h-80">
				{years.map((group) => (
					<SelectGroup key={group.year}>
						<SelectLabel>{group.year}</SelectLabel>
						{group.months.map((month) => (
							<SelectItem key={month} value={month}>
								{formatMonthYear(month)}
							</SelectItem>
						))}
					</SelectGroup>
				))}
				{listed ? null : <SelectItem value={period}>{formatMonthYear(period)}</SelectItem>}
			</SelectContent>
		</Select>
	);
}

function YearControl({
	period,
	current,
	earliest,
	onPick,
}: {
	readonly period: string;
	readonly current: string;
	readonly earliest: string | null;
	readonly onPick: (period: string) => void;
}) {
	const years = reachableYears(current, earliest);
	return (
		<Select onValueChange={onPick} value={period}>
			<SelectTrigger aria-label="Year shown" className="w-28" size="sm">
				<SelectValue />
			</SelectTrigger>
			<SelectContent className="max-h-80">
				{years.map((year) => (
					<SelectItem key={year} value={year}>
						{year}
					</SelectItem>
				))}
				{years.includes(period) ? null : <SelectItem value={period}>{period}</SelectItem>}
			</SelectContent>
		</Select>
	);
}
