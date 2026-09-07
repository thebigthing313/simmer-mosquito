/**
 * The three date labels the Inspection and Sample detail pages share.
 *
 * Both pages held byte-identical copies of all three, and of the calendar-date
 * parse behind two of them. They were merged in #609, so what these cases pin is
 * that a real date still renders the way both copies did, and that the two
 * answers the copies gave to a value they could not read have become one.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	formatDateTime,
	formatFullDate,
	formatMonthDayYear,
} from '../../../../routes/larval-surveillance/-record-dates';

/** Not a date, and not a shape a date column or a date input can hold. */
const NOT_A_DATE = 'sometime in August';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	warn.mockRestore();
});

describe('formatFullDate', () => {
	it('writes the month out in full', () => {
		expect(formatFullDate('2026-08-12')).toBe('August 12, 2026');
	});

	// A date column is a day. Read as an instant it is the 11th west of Greenwich.
	it('does not shift the day', () => {
		expect(formatFullDate('2026-08-12T02:00:00Z')).toBe('August 12, 2026');
	});

	it('hands back a date it cannot read, and says so', () => {
		expect(formatFullDate(NOT_A_DATE)).toBe(NOT_A_DATE);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain('formatFullDate');
	});
});

describe('formatMonthDayYear', () => {
	it('shortens the month for a breadcrumb', () => {
		expect(formatMonthDayYear('2026-08-12')).toBe('Aug 12, 2026');
	});

	it('hands back a date it cannot read, and says so', () => {
		expect(formatMonthDayYear(NOT_A_DATE)).toBe(NOT_A_DATE);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain('formatMonthDayYear');
	});
});

describe('formatDateTime', () => {
	it('reads a stamp on the clock the organization keeps', () => {
		// 16:30 UTC is 09:30 in Los Angeles, and 09:30 is what the record should
		// read for an organization there.
		expect(formatDateTime('2026-08-12T16:30:00Z', 'America/Los_Angeles')).toContain('9:30');
	});

	it('reads it on the browser clock when no zone has arrived yet', () => {
		expect(formatDateTime('2026-08-12T16:30:00Z', undefined)).not.toBe('');
	});

	/**
	 * It answered `Unknown`, which named the reader's problem and not the
	 * record's. Two of #609's five answers were in this pair of pages, twenty
	 * lines apart: this one and the date above, echoing.
	 */
	it('writes an unreadable stamp back rather than answering Unknown', () => {
		expect(formatDateTime('half past four', 'UTC')).toBe('half past four');
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain('formatDateTime');
	});
});
