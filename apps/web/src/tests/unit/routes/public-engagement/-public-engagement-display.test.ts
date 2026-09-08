/**
 * A service request's date, and what it does with a value it cannot read.
 *
 * One of the two formatters that builds a local `Date` on purpose: the formatter
 * names no zone, so the two cancel and the day is the day that was recorded.
 * #609 replaced the hand-rolled parse under it and left that arrangement alone,
 * which is what these cases hold.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatRequestDate } from '../../../../routes/public-engagement/-public-engagement-display';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	warn.mockRestore();
});

describe('formatRequestDate', () => {
	// The wording as well as the day: the formatter pins `en-US` since #683.
	it('renders the day the request was raised, whatever zone the reader is in', () => {
		expect(formatRequestDate('2026-08-04')).toBe('Aug 4, 2026');
	});

	it('reads the day a timestamp begins on', () => {
		expect(formatRequestDate('2026-08-04T23:30:00Z')).toBe(formatRequestDate('2026-08-04'));
	});

	it('hands back a date it cannot read, and says so', () => {
		expect(formatRequestDate('4 August')).toBe('4 August');
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain('formatRequestDate');
	});
});
