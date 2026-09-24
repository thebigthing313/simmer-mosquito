import { eyebrow } from '@simmer-mosquito/ui-web/components/eyebrow';
/**
 * The seven-day strip a daily panel is browsed by.
 *
 * The larval and control-operations overviews each open on a day of work and
 * let you walk back through the weeks behind it. Both drew the same strip: a
 * week either side of a pair of arrows, today named rather than numbered, and
 * every future day disabled because there is no data ahead of now (#873).
 *
 * The selected date is the caller's, because the panel around the strip reads
 * by it. Nothing here knows what a day holds.
 */

import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { ChevronLeftIcon, ChevronRightIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import {
	addDaysToDateString,
	buildWeek,
	dayOfMonth,
	startOfWeek,
	weekdayLabel,
} from '../lib/local-date';

export function WeekDayStrip({
	selectedDate,
	today,
	onSelect,
}: {
	readonly selectedDate: string;
	/** The organization's today, which is the last selectable day. */
	readonly today: string;
	readonly onSelect: (day: string) => void;
}) {
	const weekStart = startOfWeek(selectedDate);
	const days = buildWeek(weekStart);
	// The current week is the latest browsable one; there is no future data.
	const canGoNextWeek = weekStart < startOfWeek(today);

	const goToWeek = (deltaDays: number) => {
		const shifted = addDaysToDateString(selectedDate, deltaDays);
		onSelect(shifted > today ? today : shifted);
	};

	return (
		<div className="flex items-stretch gap-1 border-border/60 border-b p-3">
			<Button
				aria-label="Previous week"
				className="size-auto shrink-0 px-1.5"
				onClick={() => goToWeek(-7)}
				size="icon"
				variant="outline"
			>
				<ChevronLeftIcon aria-hidden="true" className="size-4" />
			</Button>
			<div className="grid flex-1 grid-cols-7 gap-1">
				{days.map((day) => {
					const isSelected = day === selectedDate;
					const isToday = day === today;
					const isFuture = day > today;
					return (
						<button
							className={cn(
								'flex flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-xs transition-colors',
								isSelected
									? 'border-primary bg-primary text-primary-foreground'
									: isFuture
										? 'cursor-not-allowed border-border/40 text-muted-foreground/40'
										: 'border-border hover:bg-accent',
							)}
							disabled={isFuture}
							key={day}
							onClick={() => onSelect(day)}
							type="button"
						>
							<span className={eyebrow({ tone: 'inherit', className: 'opacity-80' })}>
								{isToday ? 'Today' : weekdayLabel(day)}
							</span>
							<span className="font-semibold tabular-nums">{dayOfMonth(day)}</span>
						</button>
					);
				})}
			</div>
			<Button
				aria-label="Next week"
				className="size-auto shrink-0 px-1.5"
				disabled={!canGoNextWeek}
				onClick={() => goToWeek(7)}
				size="icon"
				variant="outline"
			>
				<ChevronRightIcon aria-hidden="true" className="size-4" />
			</Button>
		</div>
	);
}
