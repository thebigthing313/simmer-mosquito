import { formatTime } from '@simmer/lib/functions/format-time';
import { parseTimeToDate } from '@simmer/lib/functions/parse-time-to-date';
import { Button } from '@simmer/ui/components/button';
import { Calendar } from '@simmer/ui/components/calendar';
import { Input } from '@simmer/ui/components/input';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@simmer/ui/components/popover';
import { cn } from '@simmer/ui/lib/utils';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { FieldWrapper } from '../field-wrapper';
import { useFieldContext } from '../form-context';

interface DateTimeFieldProps {
	showTimeInput?: boolean;
	placeholder?: string;
	disabled?: boolean;
	fieldProps?: Omit<React.ComponentProps<typeof FieldWrapper>, 'children'>;
}
export function DateTimeField({
	showTimeInput = false,
	disabled = false,
	placeholder = 'Select date',
	fieldProps,
}: DateTimeFieldProps) {
	const field = useFieldContext<Date | null>();
	const [open, setOpen] = useState<boolean>(false);
	const [month, setMonth] = useState<Date | undefined>(
		field.state.value || undefined,
	);

	// Get the current value directly from the form state
	const value = field.state.value;

	const handleDateSelect = (selectedDate: Date | undefined) => {
		if (!selectedDate) {
			field.handleChange(null);
			return;
		}

		if (value && showTimeInput) {
			const newDate = new Date(selectedDate);
			newDate.setHours(
				value.getHours(),
				value.getMinutes(),
				value.getSeconds(),
			);
			field.handleChange(newDate);
		} else {
			field.handleChange(selectedDate);
		}

		setOpen(false);
		// We don't call handleBlur here because the Popover's
		// onOpenChange will catch the closure.
	};

	const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const timeValue = e.target.value;
		if (!timeValue) return;
		const newDate = parseTimeToDate(value || undefined, timeValue);
		field.handleChange(newDate);
	};

	return (
		<FieldWrapper {...fieldProps}>
			<div className={cn('flex gap-2')}>
				<Popover
					open={open}
					onOpenChange={(isOpen) => {
						setOpen(isOpen);
						if (!isOpen) field.handleBlur();
					}}
				>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							className={cn(
								'justify-between font-normal',
								showTimeInput ? 'flex-1' : 'w-full',
								!value && 'text-muted-foreground',
							)}
						>
							{value ? value.toLocaleDateString() : placeholder}
							<ChevronDown className="ml-2 h-4 w-4 opacity-50" />
						</Button>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-auto p-0">
						<Calendar
							mode="single"
							captionLayout="dropdown"
							disabled={disabled}
							month={month}
							onMonthChange={setMonth}
							onSelect={handleDateSelect}
							selected={value || undefined}
						/>
					</PopoverContent>
				</Popover>

				{showTimeInput && (
					<Input
						className="w-35"
						type="time"
						step="1"
						disabled={disabled}
						value={formatTime(value || undefined)}
						onChange={handleTimeChange}
						onBlur={field.handleBlur}
					/>
				)}
			</div>
		</FieldWrapper>
	);
}
