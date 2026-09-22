/**
 * The period picker in a period-in-review page's header: a previous arrow,
 * the grain's control, a next arrow, and a button back to the current period
 * that appears only when the shown period is not the current one. Next is
 * disabled at the current period and previous at `earliest`, both read off
 * the response; before it arrives the picker is bounded by today alone. A
 * period before `earliest` reached through the URL is shown while it is the
 * shown one, since it is a real period that happens to hold nothing.
 * `docs/today-spec.md` and `docs/monthly-spec.md`, "The picker".
 *
 * On the day grain the control is a `DatePicker` bounded to
 * `[earliest, today]`. On the month grain it is one `Select` over the
 * reachable months, newest first and grouped by year, rather than two
 * selects for month and year, which would let a person assemble a future or
 * pre-earliest month; a month before `earliest` is an extra item at the
 * bottom while it is shown, since a `Select` draws nothing for a value it
 * has no item for. The year select is #1218's.
 */

import {
	addDays,
	type OverviewGrain,
	overviewPeriodMonth,
	overviewPeriodYear,
	pad2,
} from '@simmer-mosquito/domain';
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

const PreviousIcon = iconRegistry.arrows.chevronLeft.icon;
const NextIcon = iconRegistry.arrows.chevronRight.icon;

/** The words on the arrows and the button back, per grain. */
const PICKER_COPY: Readonly<
	Record<
		OverviewGrain,
		{ readonly previous: string; readonly next: string; readonly current: string }
	>
> = {
	day: { previous: 'Previous day', next: 'Next day', current: 'Today' },
	month: { previous: 'Previous month', next: 'Next month', current: 'This month' },
	year: { previous: 'Previous year', next: 'Next year', current: 'This year' },
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

/** The period one step either side of `period` at its grain. */
function stepPeriod(grain: OverviewGrain, period: string, by: -1 | 1): string {
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

/**
 * The months from the current one back to `earliest`'s, newest first and
 * grouped by year. Before the response says where the history starts, the
 * list is the current year alone.
 */
function reachableMonths(current: string, earliest: string | null): readonly (readonly string[])[] {
	const first = earliest ?? `${current.slice(0, 4)}-01`;
	const years: string[][] = [];
	for (let month = current; month >= first; month = stepPeriod('month', month, -1)) {
		const year = month.slice(0, 4);
		const group = years.at(-1);
		if (group !== undefined && group[0]?.slice(0, 4) === year) {
			group.push(month);
		} else {
			years.push([month]);
		}
	}
	return years;
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
	const listed = years.some((group) => group.includes(period));
	return (
		<Select onValueChange={onPick} value={period}>
			<SelectTrigger aria-label="Month shown" className="w-44" size="sm">
				<SelectValue />
			</SelectTrigger>
			<SelectContent className="max-h-80">
				{years.map((group) => (
					<SelectGroup key={group[0]}>
						<SelectLabel>{group[0]?.slice(0, 4)}</SelectLabel>
						{group.map((month) => (
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
