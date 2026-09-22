/**
 * The period picker in a period-in-review page's header: a previous arrow,
 * a `DatePicker` bounded to `[earliest, today]`, a next arrow, and a button
 * back to the current period that appears only when the shown period is not
 * the current one. Next is disabled at the current period and previous at
 * `earliest`, both read off the response; before it arrives the picker is
 * bounded by today alone. A day before `earliest` reached through the URL is
 * shown as the value while it is the shown day, since it is a real period
 * that happens to hold nothing. `docs/today-spec.md`, "The picker".
 *
 * The day grain's control is the one built. The month and year selects are
 * #1217's and #1218's, and the arrows and the words already know all three
 * grains so those builds add a control and nothing else.
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
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { formatLocalDate, parseLocalDate } from '../../lib/local-date';

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
			<DayControl current={current} earliest={earliest} onPick={onPick} period={period} />
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
