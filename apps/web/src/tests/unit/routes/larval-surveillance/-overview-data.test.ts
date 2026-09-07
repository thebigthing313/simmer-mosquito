/**
 * The overview module's calendar-date helpers, and what each answers for a
 * string it cannot read.
 *
 * Five of the eight formatters that returned the em dash for a failed read were
 * here (#609), and so were all four helpers that had no guard at all:
 * `addDaysToDateString` and `startOfWeek` reached `toISOString` on an Invalid
 * Date, `weekdayLabel` handed one to `Intl`, and both throw
 * `RangeError: Invalid time value` into the render tree. `dayOfMonth` returned
 * `NaN` and passed it downstream.
 *
 * The valid-date cases are here for the other half of that: the parse behind all
 * nine was replaced, and every screen has to render a real date exactly as it
 * did before.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	addDaysToDateString,
	buildWeek,
	dayOfMonth,
	formatDate,
	formatListDate,
	formatMonthDay,
	formatWeekdayDate,
	formatWeekdayMonthDay,
	startOfWeek,
	weekdayLabel,
} from '../../../../routes/larval-surveillance/-overview-data';

/** A Wednesday, so the weekday in each label is checkable rather than incidental. */
const WEDNESDAY = '2026-08-12';

/** Not a date, and not a shape any date column or date input can hold. */
const NOT_A_DATE = 'the twelfth';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	warn.mockRestore();
});

describe('the five date formatters', () => {
	it('render a calendar date the way every screen already shows it', () => {
		expect(formatWeekdayMonthDay(WEDNESDAY)).toBe('Wed, Aug 12');
		expect(formatWeekdayDate(WEDNESDAY)).toBe('Wed, Aug 12, 2026');
		expect(formatMonthDay(WEDNESDAY)).toBe('Aug 12');
		expect(formatListDate(WEDNESDAY)).toBe('Aug 12, 2026');
		expect(formatDate(WEDNESDAY)).toBe('8/12/2026');
	});

	it('read the day a timestamp begins on, not the day its zone lands in', () => {
		expect(formatMonthDay('2026-08-12T23:30:00Z')).toBe('Aug 12');
	});

	/**
	 * The em dash announces absence and reads as "Not recorded" (#584). These
	 * five take a non-nullable string, so a hit means the value arrived and would
	 * not render, which is a different fact and used to look identical.
	 */
	it('write an unreadable date back out rather than drawing it as absent', () => {
		expect(formatWeekdayMonthDay(NOT_A_DATE)).toBe(NOT_A_DATE);
		expect(formatWeekdayDate(NOT_A_DATE)).toBe(NOT_A_DATE);
		expect(formatMonthDay(NOT_A_DATE)).toBe(NOT_A_DATE);
		expect(formatListDate(NOT_A_DATE)).toBe(NOT_A_DATE);
		expect(formatDate(NOT_A_DATE)).toBe(NOT_A_DATE);
	});

	it('warn, so a column failing on every row is not silent', () => {
		formatMonthDay('nothing here');

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain('formatMonthDay');
	});
});

describe('addDaysToDateString', () => {
	it('moves a calendar date by whole days', () => {
		expect(addDaysToDateString(WEDNESDAY, 3)).toBe('2026-08-15');
		expect(addDaysToDateString(WEDNESDAY, -12)).toBe('2026-07-31');
	});

	// It reached `toISOString` on an Invalid Date and threw into the render tree.
	it('hands an unreadable date back rather than throwing', () => {
		expect(() => addDaysToDateString(NOT_A_DATE, 1)).not.toThrow();
		expect(addDaysToDateString(NOT_A_DATE, 1)).toBe(NOT_A_DATE);
	});

	// The arithmetic it delegates to echoes in silence, because a sync bound built
	// from one is refused again downstream. A day strip is read off the screen.
	it('says so, where the arithmetic underneath it would not', () => {
		addDaysToDateString('no day in this', 1);

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain('addDaysToDateString');
	});
});

describe('startOfWeek', () => {
	it('finds the Sunday the week began on', () => {
		expect(startOfWeek(WEDNESDAY)).toBe('2026-08-09');
	});

	it('leaves a Sunday where it is', () => {
		expect(startOfWeek('2026-08-09')).toBe('2026-08-09');
	});

	it('hands an unreadable date back rather than throwing', () => {
		expect(() => startOfWeek(NOT_A_DATE)).not.toThrow();
		expect(startOfWeek(NOT_A_DATE)).toBe(NOT_A_DATE);
	});
});

describe('buildWeek', () => {
	it('lays out the seven days from Sunday', () => {
		expect(buildWeek('2026-08-09')).toEqual([
			'2026-08-09',
			'2026-08-10',
			'2026-08-11',
			'2026-08-12',
			'2026-08-13',
			'2026-08-14',
			'2026-08-15',
		]);
	});
});

describe('weekdayLabel', () => {
	it('names the weekday a date fell on', () => {
		expect(weekdayLabel(WEDNESDAY)).toBe('Wed');
	});

	// `Intl.DateTimeFormat` throws `RangeError: Invalid time value` on one.
	it('writes an unreadable date back rather than throwing', () => {
		expect(() => weekdayLabel(NOT_A_DATE)).not.toThrow();
		expect(weekdayLabel(NOT_A_DATE)).toBe(NOT_A_DATE);
	});
});

describe('dayOfMonth', () => {
	it('reads the day number', () => {
		expect(dayOfMonth(WEDNESDAY)).toBe(12);
	});

	/**
	 * Zero rather than `NaN`, and rather than 1. No month has a day zero, so a
	 * week strip showing it is visibly not showing a date, where a 1 reads as the
	 * first of the month and cannot be told from a real day.
	 */
	it('answers a number no month has rather than NaN', () => {
		expect(dayOfMonth(NOT_A_DATE)).toBe(0);
		expect(warn).toHaveBeenCalledTimes(1);
	});
});
