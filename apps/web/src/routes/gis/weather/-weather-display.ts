import type { WeatherSummaryListing } from '../../../hooks/queries/use-weather-summaries';
import { calendarDateParts } from '../../../lib/local-date';
import { unreadable } from '../../../lib/unreadable-input';

export function weatherSourceTypeLabel(sourceType: string): string {
	switch (sourceType) {
		case 'organization':
			return 'Organization';
		case 'nws':
			return 'NWS';
		default:
			return sourceType;
	}
}

/** e.g. "Mar 3–Mar 9, 2026" for a summary's reporting period. */
export function summaryPeriodLabel(summary: WeatherSummaryListing): string {
	const start = formatDate(summary.startDate);
	const end = formatDate(summary.endDate);
	if (start === end) {
		return start;
	}
	return `${start}–${end}`;
}

/**
 * A low-to-high reading, or `null` when the summary recorded neither end.
 *
 * The absence is `null` rather than a dash so that the caller draws it. A
 * formatter that bakes in a display string is how these two drifted from the
 * component every other column used.
 */
export function formatRange(min: number | null, max: number | null, unit: string): string | null {
	if (min === null && max === null) {
		return null;
	}
	if (min !== null && max !== null) {
		return min === max ? `${min}${unit}` : `${min}–${max}${unit}`;
	}
	return `${(min ?? max) as number}${unit}`;
}

/** A single reading against its unit, or `null` when the summary has none. */
export function formatMeasure(value: number | null, unit: string): string | null {
	return value === null ? null : `${value}${unit}`;
}

/**
 * `Aug 4, 2026` — a summary's day, built from the parts rather than rendered
 * through `Intl`, so no zone can move it.
 *
 * The month name is looked up rather than formatted, which is why a month
 * outside 1 to 12 is unreadable here and is only a rollover elsewhere: there is
 * no thirteenth name to print.
 */
export function formatDate(value: string): string {
	const parts = calendarDateParts(value);
	const monthName = parts === undefined ? undefined : MONTHS[parts.month - 1];
	if (parts === undefined || monthName === undefined) {
		return unreadable('formatDate', value);
	}
	return `${monthName} ${parts.day}, ${parts.year}`;
}

const MONTHS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec',
] as const;
