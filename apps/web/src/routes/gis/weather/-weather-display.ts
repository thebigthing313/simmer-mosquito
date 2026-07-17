import type { WeatherSummaryRow } from '@simmer-mosquito/sync';

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

/** e.g. "Mar 3 – Mar 9, 2026" for a summary's reporting period. */
export function summaryPeriodLabel(summary: WeatherSummaryRow): string {
	const start = formatDate(summary.startDate);
	const end = formatDate(summary.endDate);
	if (start === end) {
		return start;
	}
	return `${start} – ${end}`;
}

export function formatRange(min: number | null, max: number | null, unit: string): string {
	if (min === null && max === null) {
		return '—';
	}
	if (min !== null && max !== null) {
		return min === max ? `${min}${unit}` : `${min}–${max}${unit}`;
	}
	return `${(min ?? max) as number}${unit}`;
}

export function formatMeasure(value: number | null, unit: string): string {
	return value === null ? '—' : `${value}${unit}`;
}

function formatDate(value: string): string {
	// Dates arrive as ISO date strings (YYYY-MM-DD); render them without pulling in
	// a timezone shift by parsing the parts directly.
	const parts = value.slice(0, 10).split('-');
	const year = parts[0];
	const month = parts[1];
	const day = parts[2];
	if (year === undefined || month === undefined || day === undefined) {
		return value;
	}
	const monthIndex = Number.parseInt(month, 10) - 1;
	const monthName = MONTHS[monthIndex] ?? month;
	return `${monthName} ${Number.parseInt(day, 10)}, ${year}`;
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
