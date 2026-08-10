import { useCallback, useMemo } from 'react';
import { activeDatePresetId, type DatePreset, datePresetRange } from '../date-range-filter';

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
	readonly activePresetId: string | null;
	readonly onFromChange: (next: string) => void;
	readonly onToChange: (next: string) => void;
	readonly onApplyPreset: (preset: DatePreset) => void;
}

/**
 * Binds a `from`/`to` pair held in the URL to the date range control above an
 * explorer's list.
 *
 * Eight explorers wrote these four pieces out by hand, including the rule that
 * matters: editing one bound past the other drags the other along, so the range
 * never inverts into a window that can hold nothing.
 */
export function useDateRangeFilters({
	from,
	to,
	today,
	setFilters,
}: {
	readonly from: string;
	readonly to: string;
	readonly today: string;
	readonly setFilters: (patch: DateRangePatch) => void;
}): DateRangeBinding {
	const onFromChange = useCallback(
		(next: string) => {
			setFilters({
				from: next,
				...(next !== '' && to !== '' && next > to ? { to: next } : {}),
			});
		},
		[setFilters, to],
	);
	const onToChange = useCallback(
		(next: string) => {
			setFilters({
				to: next,
				...(next !== '' && from !== '' && next < from ? { from: next } : {}),
			});
		},
		[setFilters, from],
	);
	const onApplyPreset = useCallback(
		(preset: DatePreset) => {
			const range = datePresetRange(preset, today);
			setFilters({ from: range.from, to: range.to });
		},
		[setFilters, today],
	);
	// Which preset (if any) the current range exactly matches — drives chip highlight.
	const activePreset = useMemo(() => activeDatePresetId(from, to, today), [from, to, today]);

	return {
		from,
		to,
		today,
		activePresetId: activePreset,
		onFromChange,
		onToChange,
		onApplyPreset,
	};
}
