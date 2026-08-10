import { describe, expect, it } from 'vitest';
import { formatLocalDate, localDayStartAsTimestamp, parseLocalDate } from '../../../lib/local-date';

describe('parseLocalDate', () => {
	it('reads a calendar date as that day in local time', () => {
		const parsed = parseLocalDate('2026-08-04');
		expect(parsed?.getFullYear()).toBe(2026);
		expect(parsed?.getMonth()).toBe(7);
		expect(parsed?.getDate()).toBe(4);
	});

	it('does not shift the day the way Date parsing would', () => {
		// `new Date('2026-08-04')` is UTC midnight, which is 3 August in every zone
		// west of Greenwich. That off-by-one day is the reason this function exists.
		expect(parseLocalDate('2026-08-04')?.getDate()).toBe(new Date(2026, 7, 4).getDate());
	});

	it('ignores anything after the date part, so a timestamp still parses', () => {
		expect(parseLocalDate('2026-08-04T17:30:00Z')?.getDate()).toBe(4);
	});

	it('treats empty, null, and undefined alike as no date', () => {
		expect(parseLocalDate('')).toBeUndefined();
		expect(parseLocalDate(null)).toBeUndefined();
		expect(parseLocalDate(undefined)).toBeUndefined();
	});

	it('returns undefined rather than an Invalid Date', () => {
		expect(parseLocalDate('not-a-date')).toBeUndefined();
		expect(parseLocalDate('2026-08')).toBeUndefined();
	});
});

describe('formatLocalDate', () => {
	it('writes the local parts, zero-padded', () => {
		expect(formatLocalDate(new Date(2026, 0, 9))).toBe('2026-01-09');
	});

	it('round-trips a calendar date', () => {
		const value = '2026-12-31';
		expect(formatLocalDate(parseLocalDate(value) as Date)).toBe(value);
	});

	it('keeps the day it was given late in the evening', () => {
		// A local time that is already the next day in UTC — `toISOString().slice(0, 10)`
		// is the shortcut this replaces, and it reports tomorrow here.
		expect(formatLocalDate(new Date(2026, 7, 4, 23, 30))).toBe('2026-08-04');
	});
});

describe('localDayStartAsTimestamp', () => {
	// How Electric puts a `timestamptz` on the wire: UTC, space separator, `+00`.
	// These assertions derive it from the same instant rather than hard-coding a
	// zone, so they hold wherever the suite runs.
	function asElectricTimestamp(date: Date): string {
		const iso = date.toISOString();
		return `${iso.slice(0, 10)} ${iso.slice(11, 19)}.481000+00`;
	}

	it('writes a timestamptz literal Electric accepts, not a bare date', () => {
		expect(localDayStartAsTimestamp('2026-07-24')).toMatch(
			/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\+00$/,
		);
	});

	it('names the instant local midnight began', () => {
		const bound = localDayStartAsTimestamp('2026-07-24');
		const asInstant = new Date(`${bound.replace(' ', 'T').replace('+00', 'Z')}`);
		expect(asInstant.getTime()).toBe(new Date(2026, 6, 24).getTime());
	});

	it('sorts as a string exactly where it sorts as an instant', () => {
		// The bound is compared twice — once by Electric, once by TanStack DB as a
		// plain JS string `>=`. Both have to land on the same boundary.
		const bound = localDayStartAsTimestamp('2026-07-24');
		expect(asElectricTimestamp(new Date(2026, 6, 24, 0, 0, 1)) >= bound).toBe(true);
		expect(asElectricTimestamp(new Date(2026, 6, 24, 12, 30)) >= bound).toBe(true);
		expect(asElectricTimestamp(new Date(2026, 6, 23, 23, 59, 59)) >= bound).toBe(false);
	});

	it('falls back to the epoch rather than an unusable bound', () => {
		expect(localDayStartAsTimestamp('not-a-date')).toBe('1970-01-01 00:00:00+00');
		expect(localDayStartAsTimestamp(null)).toBe('1970-01-01 00:00:00+00');
	});
});
