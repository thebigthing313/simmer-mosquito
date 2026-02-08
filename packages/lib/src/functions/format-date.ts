/**
 * Format a date as a localized date string (no time component).
 * Uses UTC to avoid timezone shifts for date-only values.
 *
 * @param date - The date to format (can be Date, string, or null/undefined)
 * @param locale - The locale to use for formatting (defaults to 'en-US')
 * @returns Formatted date string or empty string if date is invalid
 *
 * @example
 * formatDate(new Date('2026-01-15')) // "January 15, 2026"
 * formatDate('2026-01-15') // "January 15, 2026"
 * formatDate(null) // ""
 */
export function formatDate(
	date: Date | string | null | undefined,
	locale = 'en-US',
): string {
	if (!date) {
		return '';
	}

	const dateObj = typeof date === 'string' ? new Date(date) : date;

	if (Number.isNaN(dateObj.getTime())) {
		return '';
	}

	return dateObj.toLocaleDateString(locale, {
		day: '2-digit',
		month: 'long',
		timeZone: 'UTC',
		year: 'numeric',
	});
}
