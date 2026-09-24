import { addDaysToDateString } from './local-date';

/*
 * The date-range presets and the arithmetic behind them, apart from the picker
 * that draws them. A route's `validateSearch` reads these at boot, and while
 * they sat in `components/date-range-filter.tsx` that import carried the
 * calendar and `react-day-picker` into the entry chunk with them.
 */

export interface DatePreset {
	readonly id: string;
	readonly label: string;
	/**
	 * Days back from today the preset spans (inclusive), `year` for the first of
	 * January through today, or null for no bound.
	 */
	readonly days: number | 'year' | null;
}

export const DATE_PRESETS: readonly DatePreset[] = [
	{ id: '7d', label: 'Last 7 Days', days: 7 },
	{ id: '30d', label: 'Last 30 Days', days: 30 },
	{ id: '90d', label: 'Last 90 Days', days: 90 },
	{ id: 'year', label: 'This Year', days: 'year' },
	{ id: '12mo', label: 'Last 12 Months', days: 365 },
	{ id: 'all', label: 'All Time', days: null },
];

/** The `[from, to]` bounds a preset resolves to relative to `today`. */
export function datePresetRange(
	preset: DatePreset,
	today: string,
): { readonly from: string; readonly to: string } {
	if (preset.days === null) {
		return { from: '', to: '' };
	}
	if (preset.days === 'year') {
		return { from: startOfYear(today), to: today };
	}
	return { from: addDaysToDateString(today, -(preset.days - 1)), to: today };
}

/** The first of January of the year `today` falls in, as `YYYY-MM-DD`. */
export function startOfYear(today: string): string {
	return `${today.slice(0, 4)}-01-01`;
}

/** Which preset (if any) the current range exactly matches — drives chip highlight. */
export function activeDatePresetId(from: string, to: string, today: string): string | null {
	for (const preset of DATE_PRESETS) {
		if (preset.days === null) {
			if (from === '' && to === '') {
				return preset.id;
			}
			continue;
		}
		if (to === today && from === datePresetRange(preset, today).from) {
			return preset.id;
		}
	}
	return null;
}
