import {
	activeDatePresetId,
	DATE_PRESETS_BY_DIRECTION,
	type DateDirection,
	type DatePreset,
	datePresetRange,
} from '../../lib/date-presets';

/** The only two keys this hook writes back through an explorer's `setFilters`. */
export interface DateRangePatch {
	readonly from?: string;
	readonly to?: string;
}

/** Everything `DateRangeFilter` needs, ready to spread onto it. */
export interface DateRangeBinding {
	readonly from: string;
	readonly to: string;
	readonly today: string;
	readonly direction: DateDirection;
	readonly activePresetId: string | null;
	readonly onFromChange: (next: string) => void;
	readonly onToChange: (next: string) => void;
	readonly onApplyPreset: (preset: DatePreset) => void;
}

/**
 * Binds a `from`/`to` pair held in the URL to the date range control above an
 * explorer's list. Editing one bound past the other drags the other along, so
 * the range never inverts. `direction` picks the preset set the highlight reads
 * and is handed on to the control; it is `history` unless a caller says otherwise.
 */
export function useDateRangeFilters({
	from,
	to,
	today,
	setFilters,
	direction = 'history',
}: {
	readonly from: string;
	readonly to: string;
	readonly today: string;
	readonly setFilters: (patch: DateRangePatch) => void;
	readonly direction?: DateDirection;
}): DateRangeBinding {
	const onFromChange = (next: string) => {
		setFilters({
			from: next,
			...(next !== '' && to !== '' && next > to ? { to: next } : {}),
		});
	};
	const onToChange = (next: string) => {
		setFilters({
			to: next,
			...(next !== '' && from !== '' && next < from ? { from: next } : {}),
		});
	};
	const onApplyPreset = (preset: DatePreset) => {
		const range = datePresetRange(preset, today);
		setFilters({ from: range.from, to: range.to });
	};
	// Which preset, if any, the current range exactly matches; drives the chip highlight.
	const activePreset = activeDatePresetId(from, to, today, DATE_PRESETS_BY_DIRECTION[direction]);

	return {
		from,
		to,
		today,
		direction,
		activePresetId: activePreset,
		onFromChange,
		onToChange,
		onApplyPreset,
	};
}
