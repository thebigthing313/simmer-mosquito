/**
 * Format a time from a date object as HH:MM:SS.
 * Uses local time zone for time display.
 *
 * @param date - The date to extract time from
 * @returns Formatted time string in HH:MM:SS format
 *
 * @example
 * formatTime(new Date('2026-01-15T14:30:45')) // "14:30:45"
 */
export function formatTime(date: Date | undefined): string {
	if (!date) {
		return '00:00:00';
	}

	const hours = date.getHours().toString().padStart(2, '0');
	const minutes = date.getMinutes().toString().padStart(2, '0');
	const seconds = date.getSeconds().toString().padStart(2, '0');

	return `${hours}:${minutes}:${seconds}`;
}
