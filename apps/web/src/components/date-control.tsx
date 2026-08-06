import { RequiredMark } from '@simmer-mosquito/ui-web/components/form';
import { DatePicker } from '@simmer-mosquito/ui-web/components/ui/date-picker';
import { formatLocalDate, parseLocalDate } from '../lib/local-date';

/**
 * A labelled calendar-date field for the record forms.
 *
 * Six forms had grown their own identical copy of this. They differed only in
 * what a cleared field emitted — some `''`, some `null` — so this one settles on
 * the empty string and the two forms whose field stores `null` map it at the
 * call site. That keeps the difference visible where it matters instead of
 * hidden in a prop.
 */
export function DateControl({
	label,
	value,
	required = false,
	onChange,
}: {
	readonly label: string;
	readonly value: string | null;
	readonly required?: boolean;
	/** Receives `''` when the field is cleared. */
	readonly onChange: (value: string) => void;
}) {
	return (
		<div className="grid gap-1.5">
			<span className="font-medium text-foreground text-sm">
				{label}
				{required ? <RequiredMark /> : null}
			</span>
			<DatePicker
				ariaLabel={label}
				className="w-full"
				onChange={(date) => onChange(date === undefined ? '' : formatLocalDate(date))}
				placeholder="Select date"
				value={parseLocalDate(value)}
			/>
		</div>
	);
}
