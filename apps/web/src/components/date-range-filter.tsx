import { DatePicker } from '@simmer-mosquito/ui-web/components/ui/date-picker';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { DATE_PRESETS, type DatePreset } from '../lib/date-presets';
import { formatLocalDate, parseLocalDate } from '../lib/local-date';

/**
 * Start/end date pickers over a window, with convenience presets. The pickers are
 * the primary control (an explicit range); the presets are quick shortcuts that
 * fill both. `today` bounds every selection so no future date is reachable.
 */
export function DateRangeFilter({
	from,
	to,
	today,
	activePresetId,
	onFromChange,
	onToChange,
	onApplyPreset,
	label = 'Dates',
}: {
	readonly from: string;
	readonly to: string;
	readonly today: string;
	readonly activePresetId: string | null;
	readonly onFromChange: (value: string) => void;
	readonly onToChange: (value: string) => void;
	readonly onApplyPreset: (preset: DatePreset) => void;
	readonly label?: string;
}) {
	const todayDate = parseLocalDate(today);
	const fromDate = parseLocalDate(from);
	const toDate = parseLocalDate(to);

	return (
		<div className="grid gap-2">
			<div className="flex items-center gap-3">
				<span className="w-14 shrink-0 font-medium text-muted-foreground text-xs">{label}</span>
				<div className="flex flex-1 items-center gap-2">
					<DatePicker
						ariaLabel="Start date"
						className="h-8 flex-1 text-xs"
						max={toDate ?? todayDate}
						onChange={(date) => onFromChange(date === undefined ? '' : formatLocalDate(date))}
						placeholder="Start"
						value={fromDate}
					/>
					<span className="shrink-0 text-muted-foreground text-xs">to</span>
					<DatePicker
						ariaLabel="End date"
						className="h-8 flex-1 text-xs"
						max={todayDate}
						min={fromDate}
						onChange={(date) => onToChange(date === undefined ? '' : formatLocalDate(date))}
						placeholder="End"
						value={toDate}
					/>
				</div>
			</div>
			<div className="flex flex-wrap gap-1.5 pl-[4.25rem]">
				{DATE_PRESETS.map((preset) => {
					const isActive = preset.id === activePresetId;
					return (
						<button
							aria-pressed={isActive}
							className={cn(
								'rounded-full border px-2 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
								isActive
									? 'border-primary/50 bg-primary/10 text-foreground'
									: 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground',
							)}
							key={preset.id}
							onClick={() => onApplyPreset(preset)}
							type="button"
						>
							{preset.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}
