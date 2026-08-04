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
import { useState } from 'react';
import { CalendarIcon } from '../../icons/registry';

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

	const outOfRange: Matcher[] = [];
	if (min !== undefined) {
		outOfRange.push({ before: min });
	}
	if (max !== undefined) {
		outOfRange.push({ after: max });
	}
	const defaultMonth = value ?? max;

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
				<Calendar
					autoFocus
					/*
					 * Always six week rows, padded with the neighbouring months' days.
					 * A calendar month spans four, five, or six weeks depending on the
					 * weekday it starts on, so an unpadded grid changes height as you
					 * page through it — the popup jumps, and the day under the cursor
					 * is no longer the day you were about to click.
					 */
					fixedWeeks
					mode="single"
					onSelect={(date) => {
						onChange(date);
						if (date !== undefined) {
							setOpen(false);
						}
					}}
					{...(value !== undefined ? { selected: value } : {})}
					{...(defaultMonth !== undefined ? { defaultMonth } : {})}
					{...(outOfRange.length > 0 ? { disabled: outOfRange } : {})}
				/>
			</PopoverContent>
		</Popover>
	);
}
