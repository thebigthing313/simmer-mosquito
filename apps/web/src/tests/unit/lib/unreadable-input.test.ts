/**
 * What a formatter does with input it cannot read.
 *
 * The rule is one line of behaviour and two of intent: the value goes back on
 * screen so a cell is never blank for a reason nobody can name, and a warning
 * goes where a developer sees it. #609 collected five different answers to this
 * across sixteen formatters, one of which was the em dash that #584 had already
 * given to absence.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unreadable, warnUnreadable } from '../../../lib/unreadable-input';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	warn.mockRestore();
});

describe('unreadable', () => {
	it('gives the value back as it arrived', () => {
		expect(unreadable('formatMonthDay', '04/08/2026')).toBe('04/08/2026');
	});

	it('names the formatter and the value it could not read', () => {
		unreadable('formatListDate', 'the fourth');

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain('formatListDate');
		expect(warn.mock.calls[0]?.[0]).toContain('the fourth');
	});

	it('warns once, however many rows carry the same bad value', () => {
		// A date column that fails fails on every row of the table. One line names
		// the problem; five hundred bury it.
		unreadable('formatWeekdayDate', 'repeated');
		unreadable('formatWeekdayDate', 'repeated');
		unreadable('formatWeekdayDate', 'repeated');

		expect(warn).toHaveBeenCalledTimes(1);
	});

	it('warns again for a different formatter, and for a different value', () => {
		unreadable('formatMonthDay', 'first');
		unreadable('formatMonthDay', 'second');
		unreadable('formatListDate', 'first');

		expect(warn).toHaveBeenCalledTimes(3);
	});

	it('writes a number back the way a reader would see it', () => {
		expect(unreadable('formatAmount', Number.NaN)).toBe('NaN');
		expect(unreadable('formatAmount', Number.POSITIVE_INFINITY)).toBe('Infinity');
	});
});

describe('warnUnreadable', () => {
	it('carries the same warning for a formatter whose answer is not a string', () => {
		warnUnreadable('dayOfMonth', 'no day in this');

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain('dayOfMonth');
	});

	it('shares the once-only rule with the echoing form', () => {
		warnUnreadable('dayOfMonth', 'shared');
		unreadable('dayOfMonth', 'shared');

		expect(warn).toHaveBeenCalledTimes(1);
	});
});
