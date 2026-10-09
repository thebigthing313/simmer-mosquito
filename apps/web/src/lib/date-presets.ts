import { addDaysToDateString } from './local-date';

/*
 * The date-range presets and the arithmetic behind them, apart from the picker
 * that draws them. A route's `validateSearch` reads these at boot, and while
 * they sat in `components/date-range-filter.tsx` that import carried the
 * calendar and `react-day-picker` into the entry chunk with them.
 */

/**
 * Which way a date range control looks. A `history` page reads records already
 * made, so every window ends today; a `schedule` page reads work planned ahead,
 * so a window can end after today.
 */
export type DateDirection = 'history' | 'schedule';

export interface DatePreset {
	readonly id: string;
	readonly label: string;
	/**
	 * Days the window spans up to and including today, `year` for the first of
	 * January through today, or null for no bound on either side.
	 */
	readonly days: number | 'year' | null;
	/** Days after today the window runs through. Absent, it ends today. */
	readonly ahead?: number;
}

const LAST_7_DAYS: DatePreset = { id: '7d', label: 'Last 7 Days', days: 7 };
const ALL_TIME: DatePreset = { id: 'all', label: 'All Time', days: null };

export const DATE_PRESETS: readonly DatePreset[] = [
	LAST_7_DAYS,
	{ id: '30d', label: 'Last 30 Days', days: 30 },
	{ id: '90d', label: 'Last 90 Days', days: 90 },
	{ id: 'year', label: 'This Year', days: 'year' },
	{ id: '12mo', label: 'Last 12 Months', days: 365 },
	ALL_TIME,
];

/**
 * The window a schedule opens on: the week just gone plus the fortnight ahead,
 * so today's dispatch and what is queued behind it are both on screen without
 * touching a filter. Eight days up to and including today is seven back. The
 * Missions and Assignments pages default to it and the operations overview's
 * schedule panel reads it, so the three agree.
 */
export const SCHEDULE_WINDOW: DatePreset = {
	id: 'recent-upcoming',
	label: 'Recent and Upcoming',
	days: 8,
	ahead: 14,
};

export const SCHEDULE_DATE_PRESETS: readonly DatePreset[] = [
	SCHEDULE_WINDOW,
	{ id: 'next-7d', label: 'Next 7 Days', days: 1, ahead: 6 },
	{ id: 'next-30d', label: 'Next 30 Days', days: 1, ahead: 29 },
	LAST_7_DAYS,
	ALL_TIME,
];

export const DATE_PRESETS_BY_DIRECTION: Readonly<Record<DateDirection, readonly DatePreset[]>> = {
	history: DATE_PRESETS,
	schedule: SCHEDULE_DATE_PRESETS,
};

/** The `[from, to]` bounds a preset resolves to relative to `today`. */
export function datePresetRange(
	preset: DatePreset,
	today: string,
): { readonly from: string; readonly to: string } {
	if (preset.days === null) {
		return { from: '', to: '' };
	}
	const to = addDaysToDateString(today, preset.ahead ?? 0);
	if (preset.days === 'year') {
		return { from: startOfYear(today), to };
	}
	return { from: addDaysToDateString(today, -(preset.days - 1)), to };
}

/** The first of January of the year `today` falls in, as `YYYY-MM-DD`. */
export function startOfYear(today: string): string {
	return `${today.slice(0, 4)}-01-01`;
}

/**
 * Which preset in `presets`, if any, the current range exactly matches. Drives
 * the chip highlight. The history set unless a caller passes another.
 */
export function activeDatePresetId(
	from: string,
	to: string,
	today: string,
	presets: readonly DatePreset[] = DATE_PRESETS,
): string | null {
	for (const preset of presets) {
		const range = datePresetRange(preset, today);
		if (range.from === from && range.to === to) {
			return preset.id;
		}
	}
	return null;
}
