/**
 * Parse a time string (HH:MM or HH:MM:SS) and apply it to a date.
 * Preserves the date component while updating the time.
 *
 * @param date - The base date (or undefined to use current date)
 * @param timeString - Time string in HH:MM or HH:MM:SS format
 * @returns New Date object with updated time
 *
 * @example
 * parseTimeToDate(new Date('2026-01-15'), '14:30:45')
 * // Returns Date with date 2026-01-15 and time 14:30:45
 */
export function parseTimeToDate(
	date: Date | undefined,
	timeString: string,
): Date {
	const [hours = '0', minutes = '0', seconds = '0'] = timeString.split(':');
	const newDate = date ? new Date(date) : new Date();

	newDate.setHours(Number.parseInt(hours, 10));
	newDate.setMinutes(Number.parseInt(minutes, 10));
	newDate.setSeconds(Number.parseInt(seconds, 10));

	return newDate;
}
