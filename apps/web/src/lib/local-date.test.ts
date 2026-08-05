import { describe, expect, it } from 'vitest';
import { formatLocalDate, parseLocalDate } from './local-date';

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
